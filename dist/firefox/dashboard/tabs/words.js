// dashboard/tabs/words.js — Words Tab
//
// Features:
//   - Filterable/searchable word table
//   - Inline editing of canonical and POS
//   - Per-row Normalize button
//   - Bulk "Normalize all raw" button
//   - "Find Duplicates" button with merge/keep/delete UI
//   - Per-row delete
//   - Row checkboxes + "Delete selected" bulk action
//   - "Delete all" button (filter-aware)

/* global storage, getNormalizer, getDeduplicator, vocDash */

const wordsTab = (function () {
  'use strict';

  const POS_OPTIONS = ['', 'verb', 'adj', 'adv', 'noun', 'phrase'];

  let allWords     = [];
  let normalizer   = null;
  let deduplicator = null;
  let currentFilter = { status: '', pos: '', search: '' };
  let dupGroups    = [];
  let selectedIds  = new Set();  // ids of checked rows
  let settings     = {};

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    settings   = await storage.getSettings();
    normalizer = getNormalizer(settings);
    deduplicator = getDeduplicator(settings);

    render();

    // Reload when tab becomes active
    document.addEventListener('voc:tabactivate', e => {
      if (e.detail.tab === 'words') reload();
    });
  }

  async function reload() {
    settings     = await storage.getSettings();
    normalizer   = getNormalizer(settings);
    deduplicator = getDeduplicator(settings);
    allWords     = await storage.getWords();
    dupGroups    = [];
    selectedIds  = new Set();
    renderTable();
    vocDash.setWordCount(allWords.length);
  }

  // ── Top-level render (builds the whole tab skeleton) ──────────────────────

  function render() {
    const root = document.getElementById('words-root');
    root.innerHTML = `
      <!-- Toolbar -->
      <div class="toolbar">
        <div class="search-wrapper">
          <input type="search" id="words-search" class="input input-search" placeholder="Search words…">
        </div>
        <select id="words-filter-status" class="select">
          <option value="">All statuses</option>
          <option value="raw">Raw</option>
          <option value="normalized">Normalized</option>
          <option value="grouped">Grouped</option>
          <option value="exported">Exported</option>
        </select>
        <select id="words-filter-pos" class="select">
          <option value="">All POS</option>
          <option value="verb">Verb</option>
          <option value="adj">Adjective</option>
          <option value="adv">Adverb</option>
          <option value="noun">Noun</option>
          <option value="phrase">Phrase</option>
        </select>
        <div style="flex:1"></div>
        <button id="btn-normalize-all" class="btn btn-primary">⚡ Normalize all raw</button>
        <button id="btn-find-dups" class="btn">🔍 Find duplicates</button>
        <button id="btn-delete-selected" class="btn btn-danger" style="display:none">🗑 Delete selected (<span id="selected-count">0</span>)</button>
        <button id="btn-delete-all" class="btn btn-danger">🗑 Delete all</button>
      </div>

      <!-- Duplicate groups panel (hidden until "Find duplicates" runs) -->
      <div id="dup-panel"></div>

      <!-- Table -->
      <div class="table-wrap">
        <table id="words-table">
          <thead>
            <tr>
              <th class="col-check"><input type="checkbox" id="chk-select-all" title="Select all visible"></th>
              <th class="col-word">Word</th>
              <th class="col-trans">Translation</th>
              <th class="col-canonical">Canonical</th>
              <th class="col-pos">POS</th>
              <th class="col-status">Status</th>
              <th class="col-date">Saved</th>
              <th class="col-notes">Notes</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody id="words-tbody">
            <tr><td colspan="9" style="text-align:center;padding:40px;color:#9aa0a6">
              <span class="spinner"></span> Loading…
            </td></tr>
          </tbody>
        </table>
      </div>
    `;

    // Bind toolbar events
    document.getElementById('words-search').addEventListener('input', e => {
      currentFilter.search = e.target.value.trim().toLowerCase();
      renderTable();
    });
    document.getElementById('words-filter-status').addEventListener('change', e => {
      currentFilter.status = e.target.value;
      renderTable();
    });
    document.getElementById('words-filter-pos').addEventListener('change', e => {
      currentFilter.pos = e.target.value;
      renderTable();
    });
    document.getElementById('btn-normalize-all').addEventListener('click', normalizeAllRaw);
    document.getElementById('btn-find-dups').addEventListener('click', findDuplicates);
    document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);
    document.getElementById('btn-delete-all').addEventListener('click', deleteAll);
    document.getElementById('chk-select-all').addEventListener('change', onSelectAll);

    // Initial data load
    reload();
  }

  // ── Table rendering ────────────────────────────────────────────────────────

  function filteredWords() {
    return allWords.filter(w => {
      if (currentFilter.status && w.status !== currentFilter.status) return false;
      if (currentFilter.pos    && w.pos    !== currentFilter.pos)    return false;
      if (currentFilter.search) {
        const q = currentFilter.search;
        const haystack = [w.word, w.translation, w.canonical, w.notes].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  function renderTable() {
    const tbody = document.getElementById('words-tbody');
    if (!tbody) return;

    const words = filteredWords();
    vocDash.setWordCount(allWords.length);

    if (words.length === 0) {
      tbody.innerHTML = `<tr><td colspan="9">
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-title">${allWords.length === 0 ? 'No words saved yet' : 'No words match the filter'}</div>
          <div class="empty-state-desc">${allWords.length === 0
            ? 'Go to <a href="https://translate.google.com" target="_blank">Google Translate</a> and click Save next to a translation.'
            : 'Try clearing the search or changing the filters.'
          }</div>
        </div>
      </td></tr>`;
      updateSelectionUI();
      return;
    }

    // Build all rows — highlight ids that are in dup groups
    const dupIds = new Set(dupGroups.flatMap(g => g.words.map(w => w.id)));

    tbody.innerHTML = words.map(w => rowHtml(w, dupIds.has(w.id))).join('');

    // Bind row-level events after injecting HTML
    bindRowEvents(tbody);
    updateSelectionUI();
  }

  function rowHtml(w, isDup) {
    const esc = vocDash.esc;
    const posClass = w.pos ? `pos-${esc(w.pos)}` : 'pos-empty';
    const posLabel = w.pos || '—';
    const statusClass = `status-${esc(w.status)}`;
    const checked = selectedIds.has(w.id) ? 'checked' : '';

    return `
      <tr data-id="${esc(w.id)}" class="${isDup ? 'dup-highlight' : ''}">
        <td class="col-check"><input type="checkbox" class="row-chk" data-id="${esc(w.id)}" ${checked}></td>
        <td class="col-word">${esc(w.word)}</td>
        <td class="col-trans">${esc(w.translation)}</td>
        <td class="col-canonical">
          <span class="editable" data-field="canonical" data-id="${esc(w.id)}"
                title="Click to edit">${esc(w.canonical || '—')}</span>
        </td>
        <td class="col-pos">
          <span class="pos-badge ${posClass}" data-field="pos" data-id="${esc(w.id)}"
                title="Click to change POS">${esc(posLabel)}</span>
        </td>
        <td class="col-status">
          <span class="status-badge ${statusClass}">${esc(w.status)}</span>
        </td>
        <td class="col-date">${esc(vocDash.formatDate(w.savedAt))}</td>
        <td class="col-notes">
          <span class="notes-text editable" data-field="notes" data-id="${esc(w.id)}"
                title="Click to edit notes">${esc(w.notes || '')}</span>
        </td>
        <td class="col-actions" style="white-space:nowrap">
          <button class="btn btn-sm btn-normalize" data-id="${esc(w.id)}" title="Normalize this word">⚡</button>
          <button class="btn btn-sm btn-danger btn-delete" data-id="${esc(w.id)}" title="Delete">🗑</button>
        </td>
      </tr>`;
  }

  // ── Row event binding ──────────────────────────────────────────────────────

  function bindRowEvents(tbody) {
    // Inline edit — canonical & notes
    tbody.querySelectorAll('.editable').forEach(el => {
      el.addEventListener('click', onEditableClick);
    });

    // POS badge click — open inline select
    tbody.querySelectorAll('.pos-badge[data-field="pos"]').forEach(el => {
      el.addEventListener('click', onPosClick);
    });

    // Normalize single row
    tbody.querySelectorAll('.btn-normalize').forEach(btn => {
      btn.addEventListener('click', () => normalizeSingle(btn.dataset.id));
    });

    // Delete row
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteWord(btn.dataset.id));
    });

    // Row checkboxes
    tbody.querySelectorAll('.row-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        if (chk.checked) {
          selectedIds.add(chk.dataset.id);
        } else {
          selectedIds.delete(chk.dataset.id);
        }
        updateSelectionUI();
      });
    });
  }

  // ── Inline editing — canonical / notes ────────────────────────────────────

  function onEditableClick(e) {
    const el    = e.currentTarget;
    const field = el.dataset.field;
    const id    = el.dataset.id;
    const word  = allWords.find(w => w.id === id);
    if (!word) return;

    const current = word[field] || '';

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'inline-input';
    input.value     = current;

    el.replaceWith(input);
    input.focus();
    input.select();

    async function save() {
      const newVal = input.value.trim();
      const patch  = { [field]: newVal };

      // If canonical was edited, auto-update status to 'normalized' (if still 'raw')
      if (field === 'canonical' && word.status === 'raw' && newVal) {
        patch.status = 'normalized';
      }

      try {
        const updated = await storage.updateWord(id, patch);
        const idx = allWords.findIndex(w => w.id === id);
        if (idx !== -1) allWords[idx] = updated;
      } catch (err) {
        vocDash.toast('Save failed: ' + err.message, 'error');
      }
      renderTable();
    }

    input.addEventListener('blur',    save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  { input.blur(); }
      if (e.key === 'Escape') { input.removeEventListener('blur', save); renderTable(); }
    });
  }

  // ── Inline POS select ──────────────────────────────────────────────────────

  function onPosClick(e) {
    const el   = e.currentTarget;
    const id   = el.dataset.id;
    const word = allWords.find(w => w.id === id);
    if (!word) return;

    const sel = document.createElement('select');
    sel.className = 'inline-select';
    POS_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '—';
      if (opt === word.pos) o.selected = true;
      sel.appendChild(o);
    });

    el.replaceWith(sel);
    sel.focus();

    async function save() {
      const newPos = sel.value;
      try {
        const updated = await storage.updateWord(id, { pos: newPos });
        const idx = allWords.findIndex(w => w.id === id);
        if (idx !== -1) allWords[idx] = updated;
      } catch (err) {
        vocDash.toast('Save failed: ' + err.message, 'error');
      }
      renderTable();
    }

    sel.addEventListener('change', save);
    sel.addEventListener('blur',   () => { setTimeout(renderTable, 80); });
  }

  // ── Normalize single word ──────────────────────────────────────────────────

  async function normalizeSingle(id) {
    const word = allWords.find(w => w.id === id);
    if (!word) return;

    const btn = document.querySelector(`.btn-normalize[data-id="${id}"]`);
    if (btn) { btn.disabled = true; btn.textContent = '…'; }

    try {
      const result = await normalizer.normalize(word.word, word.pos, word.translation);
      const updated = await storage.updateWord(id, {
        canonical: result.canonical,
        pos:       result.pos,
        status:    'normalized',
      });
      const idx = allWords.findIndex(w => w.id === id);
      if (idx !== -1) allWords[idx] = updated;
      vocDash.toast(`Normalized: ${result.canonical}`, 'success');
    } catch (err) {
      vocDash.toast('Normalization failed: ' + err.message, 'error');
    }

    renderTable();
  }

  // ── Normalize all raw ──────────────────────────────────────────────────────

  async function normalizeAllRaw() {
    const rawWords = allWords.filter(w => w.status === 'raw');
    if (rawWords.length === 0) {
      vocDash.toast('No raw words to normalize.');
      return;
    }

    const btn = document.getElementById('btn-normalize-all');
    btn.disabled = true;
    btn.textContent = `⏳ Normalizing 0/${rawWords.length}…`;

    let done = 0;
    for (const word of rawWords) {
      try {
        const result = await normalizer.normalize(word.word, word.pos, word.translation);
        const updated = await storage.updateWord(word.id, {
          canonical: result.canonical,
          pos:       result.pos,
          status:    'normalized',
        });
        const idx = allWords.findIndex(w => w.id === word.id);
        if (idx !== -1) allWords[idx] = updated;
      } catch (_) { /* skip failed words */ }

      done++;
      btn.textContent = `⏳ Normalizing ${done}/${rawWords.length}…`;
    }

    btn.disabled = false;
    btn.textContent = '⚡ Normalize all raw';
    vocDash.toast(`Normalized ${done} word${done !== 1 ? 's' : ''}.`, 'success');
    renderTable();
  }

  // ── Delete word ────────────────────────────────────────────────────────────

  async function deleteWord(id) {
    const word = allWords.find(w => w.id === id);
    if (!word) return;
    if (!confirm(`Delete "${word.word}"?`)) return;

    try {
      await storage.deleteWord(id);
      allWords = allWords.filter(w => w.id !== id);
      selectedIds.delete(id);
      vocDash.toast('Word deleted.');
    } catch (err) {
      vocDash.toast('Delete failed: ' + err.message, 'error');
    }
    renderTable();
  }

  // ── Bulk delete ────────────────────────────────────────────────────────────

  /**
   * Updates the "Delete selected" button visibility/count and the select-all
   * checkbox state to reflect the current selection.
   */
  function updateSelectionUI() {
    const btnDelSelected = document.getElementById('btn-delete-selected');
    const countEl        = document.getElementById('selected-count');
    const chkAll         = document.getElementById('chk-select-all');
    if (!btnDelSelected) return;

    const visibleIds = filteredWords().map(w => w.id);
    const count      = visibleIds.filter(id => selectedIds.has(id)).length;

    countEl.textContent = count;
    btnDelSelected.style.display = count > 0 ? '' : 'none';

    if (chkAll) {
      chkAll.checked       = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));
      chkAll.indeterminate = count > 0 && count < visibleIds.length;
    }
  }

  /** Toggles selection of all currently visible rows. */
  function onSelectAll(e) {
    const visibleIds = filteredWords().map(w => w.id);
    if (e.target.checked) {
      visibleIds.forEach(id => selectedIds.add(id));
    } else {
      visibleIds.forEach(id => selectedIds.delete(id));
    }
    renderTable();
  }

  /** Deletes only the currently selected rows. */
  async function deleteSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} selected word${ids.length !== 1 ? 's' : ''}?`)) return;

    try {
      await storage.deleteWords(ids);
      allWords = allWords.filter(w => !selectedIds.has(w.id));
      selectedIds = new Set();
      vocDash.toast(`Deleted ${ids.length} word${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      vocDash.toast('Delete failed: ' + err.message, 'error');
    }
    renderTable();
    vocDash.setWordCount(allWords.length);
  }

  /**
   * Deletes ALL words currently visible (respects active filters).
   * If no filter is active, this clears the entire word list.
   */
  async function deleteAll() {
    const visible = filteredWords();
    if (visible.length === 0) return;

    const isFiltered = currentFilter.status || currentFilter.pos || currentFilter.search;
    const msg = isFiltered
      ? `Delete all ${visible.length} matching word${visible.length !== 1 ? 's' : ''}?`
      : `Delete ALL ${visible.length} word${visible.length !== 1 ? 's' : ''}? This cannot be undone.`;

    if (!confirm(msg)) return;

    const ids = visible.map(w => w.id);
    try {
      await storage.deleteWords(ids);
      allWords = allWords.filter(w => !ids.includes(w.id));
      selectedIds = new Set();
      vocDash.toast(`Deleted ${ids.length} word${ids.length !== 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      vocDash.toast('Delete failed: ' + err.message, 'error');
    }
    renderTable();
    vocDash.setWordCount(allWords.length);
  }

  // ── Find duplicates ────────────────────────────────────────────────────────

  async function findDuplicates() {
    const btn = document.getElementById('btn-find-dups');
    btn.disabled = true;
    btn.textContent = '⏳ Scanning…';

    try {
      dupGroups = await deduplicator.findDuplicates(allWords);
    } catch (err) {
      vocDash.toast('Dedup failed: ' + err.message, 'error');
      dupGroups = [];
    }

    btn.disabled = false;
    btn.textContent = '🔍 Find duplicates';

    renderDupPanel();
    renderTable(); // re-render to highlight dup rows
  }

  function renderDupPanel() {
    const panel = document.getElementById('dup-panel');
    if (!panel) return;

    if (dupGroups.length === 0) {
      panel.innerHTML = `<div class="dup-banner">✅ No duplicates found.</div>`;
      setTimeout(() => { panel.innerHTML = ''; }, 3000);
      return;
    }

    const esc = vocDash.esc;

    panel.innerHTML = `
      <div class="dup-banner">
        <strong>⚠ Found ${dupGroups.length} duplicate group${dupGroups.length !== 1 ? 's' : ''}.</strong>
        Resolve each group below, then the highlights will clear.
        ${dupGroups.map((g, gi) => `
          <div class="dup-group">
            <div class="dup-group-header">${esc(g.reason)} — ${g.words.length} words</div>
            ${g.words.map(w => `
              <div style="font-size:12px;margin-bottom:2px">
                <strong>${esc(w.word)}</strong>
                ${w.canonical ? `→ <em>${esc(w.canonical)}</em>` : ''}
                &nbsp;<span class="status-badge status-${esc(w.status)}">${esc(w.status)}</span>
              </div>`).join('')}
            <div class="dup-actions">
              <button class="btn btn-sm btn-keep-first" data-gi="${gi}">Keep first, delete rest</button>
              <button class="btn btn-sm btn-merge"      data-gi="${gi}">Merge notes</button>
              <button class="btn btn-sm"               data-gi="${gi}" onclick="vocDash.toast('Skipped.')">Skip</button>
            </div>
          </div>`).join('')}
      </div>`;

    panel.querySelectorAll('.btn-keep-first').forEach(btn => {
      btn.addEventListener('click', () => resolveKeepFirst(parseInt(btn.dataset.gi)));
    });
    panel.querySelectorAll('.btn-merge').forEach(btn => {
      btn.addEventListener('click', () => resolveMerge(parseInt(btn.dataset.gi)));
    });
  }

  async function resolveKeepFirst(gi) {
    const group = dupGroups[gi];
    if (!group) return;
    const [keep, ...rest] = group.words;
    for (const w of rest) {
      try { await storage.deleteWord(w.id); } catch (_) {}
    }
    allWords = allWords.filter(w => !rest.some(r => r.id === w.id));
    dupGroups.splice(gi, 1);
    vocDash.toast(`Kept "${keep.word}", deleted ${rest.length} duplicate${rest.length > 1 ? 's' : ''}.`, 'success');
    renderDupPanel();
    renderTable();
  }

  async function resolveMerge(gi) {
    const group = dupGroups[gi];
    if (!group) return;
    const [keep, ...rest] = group.words;
    const mergedNotes = [keep, ...rest]
      .map(w => w.notes).filter(Boolean).join(' | ');

    try {
      const updated = await storage.updateWord(keep.id, { notes: mergedNotes });
      const idx = allWords.findIndex(w => w.id === keep.id);
      if (idx !== -1) allWords[idx] = updated;
      for (const w of rest) {
        await storage.deleteWord(w.id);
      }
      allWords = allWords.filter(w => !rest.some(r => r.id === w.id));
    } catch (err) {
      vocDash.toast('Merge failed: ' + err.message, 'error');
      return;
    }

    dupGroups.splice(gi, 1);
    vocDash.toast('Merged notes, duplicates deleted.', 'success');
    renderDupPanel();
    renderTable();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { init };

})();
