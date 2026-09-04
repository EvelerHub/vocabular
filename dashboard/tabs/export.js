// dashboard/tabs/export.js — Export Tab
//
// Features:
//   - Select groups to export (checkbox list)
//   - Live preview of the export text
//   - Download .txt button
//   - Copy to clipboard button
//   - After export: marks words as 'exported', sets group.exportedAt

/* global storage, buildExportText, downloadAsFile, copyToClipboard, buildFilename, vocDash */

const exportTab = (function () {
  'use strict';

  let allWords   = [];
  let allGroups  = [];
  let settings   = {};
  let selectedIds = new Set();  // selected group ids

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('voc:tabactivate', e => {
      if (e.detail.tab === 'export') reload();
    });
  }

  async function reload() {
    [allWords, allGroups, settings] = await Promise.all([
      storage.getWords(),
      storage.getGroups(),
      storage.getSettings(),
    ]);
    selectedIds = new Set();
    render();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    const root = document.getElementById('export-root');
    if (!root) return;

    if (allGroups.length === 0) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📤</div>
          <div class="empty-state-title">No groups to export</div>
          <div class="empty-state-desc">
            Save and group some words first, then come back here to export.
          </div>
        </div>`;
      return;
    }

    const termSepLabel = settings.exportTermSep === '\t' ? 'Tab'
                       : settings.exportTermSep === ',' ? 'Comma' : 'Dash';
    const rowSepLabel  = settings.exportRowSep === '\n' ? 'New line' : 'Semicolon';

    root.innerHTML = `
      <div class="export-layout">

        <!-- Left: group selector -->
        <div class="export-groups-panel">
          <div class="export-panel-title">Select groups to export</div>
          <div class="export-groups-list" id="export-groups-list">
            ${allGroups.map(g => groupRowHtml(g)).join('')}
          </div>
          <div class="export-select-all">
            <button id="btn-select-all"  class="btn btn-sm">Select all</button>
            <button id="btn-select-none" class="btn btn-sm">Clear</button>
          </div>
        </div>

        <!-- Right: preview + actions -->
        <div class="export-preview-panel">
          <div class="export-panel-title">
            Preview
            <span class="export-format-hint">
              Format: <strong>${vocDash.esc(termSepLabel)}</strong> between term/definition,
              <strong>${vocDash.esc(rowSepLabel)}</strong> between cards
              — <a href="#" id="link-settings" style="color:var(--blue)">change in Settings</a>
            </span>
          </div>
          <textarea id="export-preview" class="export-preview" readonly
                    placeholder="Select groups on the left to preview…"></textarea>
          <div class="export-actions">
            <span id="export-word-count" class="export-word-count">0 words selected</span>
            <div style="display:flex;gap:8px">
              <button id="btn-copy" class="btn" disabled>📋 Copy</button>
              <button id="btn-download" class="btn btn-primary" disabled>⬇ Download .txt</button>
            </div>
          </div>
        </div>

      </div>`;

    bindExportEvents(root);
  }

  function groupRowHtml(group) {
    const esc    = vocDash.esc;
    const words  = allWords.filter(w => w.groupId === group.id);
    const isExp  = !!group.exportedAt;
    const checked = selectedIds.has(group.id) ? 'checked' : '';

    return `
      <label class="export-group-row ${isExp ? 'export-group-exported' : ''}">
        <input type="checkbox" class="export-group-cb" value="${esc(group.id)}" ${checked}>
        <span class="export-group-name">${esc(group.name)}</span>
        <span class="export-group-meta">
          ${words.length} word${words.length !== 1 ? 's' : ''}
          ${isExp ? `<span class="status-badge status-exported" style="margin-left:4px">exported ${esc(vocDash.formatDate(group.exportedAt))}</span>` : ''}
        </span>
      </label>`;
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  function bindExportEvents(root) {
    // Checkbox changes
    root.querySelectorAll('.export-group-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(cb.value);
        else            selectedIds.delete(cb.value);
        updatePreview();
      });
    });

    root.querySelector('#btn-select-all')?.addEventListener('click', () => {
      allGroups.forEach(g => selectedIds.add(g.id));
      root.querySelectorAll('.export-group-cb').forEach(cb => cb.checked = true);
      updatePreview();
    });

    root.querySelector('#btn-select-none')?.addEventListener('click', () => {
      selectedIds.clear();
      root.querySelectorAll('.export-group-cb').forEach(cb => cb.checked = false);
      updatePreview();
    });

    root.querySelector('#btn-download')?.addEventListener('click', doDownload);
    root.querySelector('#btn-copy')?.addEventListener('click',     doCopy);

    root.querySelector('#link-settings')?.addEventListener('click', e => {
      e.preventDefault();
      vocDash.activateTab('settings');
    });
  }

  // ── Preview ────────────────────────────────────────────────────────────────

  function getSelectedWords() {
    return allWords.filter(w => w.groupId && selectedIds.has(w.groupId));
  }

  function updatePreview() {
    const words   = getSelectedWords();
    const text    = buildExportText(words, settings);
    const preview = document.getElementById('export-preview');
    const countEl = document.getElementById('export-word-count');
    const btnDl   = document.getElementById('btn-download');
    const btnCopy = document.getElementById('btn-copy');

    if (preview)  preview.value = text;
    if (countEl)  countEl.textContent = `${words.length} word${words.length !== 1 ? 's' : ''} selected`;
    if (btnDl)    btnDl.disabled  = words.length === 0;
    if (btnCopy)  btnCopy.disabled = words.length === 0;
  }

  // ── Download ───────────────────────────────────────────────────────────────

  async function doDownload() {
    const words = getSelectedWords();
    if (words.length === 0) return;

    const groupNames = allGroups
      .filter(g => selectedIds.has(g.id))
      .map(g => g.name)
      .join('+');

    const text     = buildExportText(words, settings);
    const filename = buildFilename(groupNames);
    downloadAsFile(text, filename);

    await markExported(words);
    vocDash.toast(`Downloaded ${filename}`, 'success');
  }

  // ── Copy ───────────────────────────────────────────────────────────────────

  async function doCopy() {
    const words = getSelectedWords();
    if (words.length === 0) return;

    const text = buildExportText(words, settings);
    const ok   = await copyToClipboard(text);
    if (ok) {
      await markExported(words);
      vocDash.toast(`${words.length} words copied to clipboard.`, 'success');
    } else {
      vocDash.toast('Copy failed — try Download instead.', 'error');
    }
  }

  // ── Mark exported ──────────────────────────────────────────────────────────

  async function markExported(words) {
    const now = new Date().toISOString();

    // Update words
    for (const w of words) {
      try {
        const updated = await storage.updateWord(w.id, { status: 'exported' });
        const idx = allWords.findIndex(x => x.id === w.id);
        if (idx !== -1) allWords[idx] = updated;
      } catch (_) {}
    }

    // Update groups
    for (const groupId of selectedIds) {
      try {
        const updated = await storage.updateGroup(groupId, { exportedAt: now });
        const idx = allGroups.findIndex(g => g.id === groupId);
        if (idx !== -1) allGroups[idx] = updated;
      } catch (_) {}
    }

    // Re-render to show updated exported badges
    render();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { init };

})();
