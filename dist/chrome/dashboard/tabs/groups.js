// dashboard/tabs/groups.js — Groups Tab
//
// Features:
//   - Auto-partition words into groups of settings.groupSize (oldest first)
//   - Rename groups (click name → inline input)
//   - Drag-and-drop words between groups
//   - Visual distinction for exported groups
//   - Create / delete groups

/* global storage, vocDash */

const groupsTab = (function () {
  'use strict';

  let allWords  = [];
  let allGroups = [];
  let settings  = {};

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('voc:tabactivate', e => {
      if (e.detail.tab === 'groups') reload();
    });
  }

  async function reload() {
    [allWords, allGroups, settings] = await Promise.all([
      storage.getWords(),
      storage.getGroups(),
      storage.getSettings(),
    ]);
    await autoPartition();
    render();
  }

  // ── Auto-partition ─────────────────────────────────────────────────────────
  // Words not yet assigned to a group are batched into groups of groupSize,
  // ordered by savedAt ascending.

  async function autoPartition() {
    const groupSize  = settings.groupSize || 50;
    const ungrouped  = allWords.filter(w => !w.groupId);
    if (ungrouped.length === 0) return;

    // Sort oldest first (storage.getWords already does this, but be explicit)
    ungrouped.sort((a, b) => a.savedAt.localeCompare(b.savedAt));

    let changed = false;

    for (let i = 0; i < ungrouped.length; i += groupSize) {
      const batch     = ungrouped.slice(i, i + groupSize);
      const groupNum  = allGroups.length + 1;
      const newGroup  = await storage.saveGroup({ name: `Set ${groupNum}` });
      allGroups.push(newGroup);

      for (const word of batch) {
        const updated = await storage.updateWord(word.id, {
          groupId: newGroup.id,
          status:  word.status === 'raw' ? 'raw' : 'grouped',
        });
        const idx = allWords.findIndex(w => w.id === word.id);
        if (idx !== -1) allWords[idx] = updated;
      }
      changed = true;
    }

    if (changed) {
      allGroups = await storage.getGroups();
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    const root = document.getElementById('groups-root');
    if (!root) return;

    if (allGroups.length === 0) {
      root.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📂</div>
          <div class="empty-state-title">No groups yet</div>
          <div class="empty-state-desc">Save some words first — they'll be grouped automatically.</div>
        </div>`;
      return;
    }

    root.innerHTML = `
      <div class="toolbar">
        <span style="color:var(--gray-3);font-size:12px">
          ${allGroups.length} group${allGroups.length !== 1 ? 's' : ''} •
          ${allWords.length} word${allWords.length !== 1 ? 's' : ''} total
        </span>
        <div style="flex:1"></div>
        <button id="btn-new-group" class="btn">+ New group</button>
      </div>
      <div id="groups-grid" class="groups-grid">
        ${allGroups.map(g => groupCardHtml(g)).join('')}
      </div>`;

    bindGroupEvents(root);
  }

  // ── Group card HTML ────────────────────────────────────────────────────────

  function groupCardHtml(group) {
    const esc    = vocDash.esc;
    const words  = allWords.filter(w => w.groupId === group.id);
    const isExp  = !!group.exportedAt;

    return `
      <div class="group-card ${isExp ? 'group-exported' : ''}"
           data-group-id="${esc(group.id)}"
           ondragover="event.preventDefault()"
           ondrop="groupsTab._onDrop(event,'${esc(group.id)}')">

        <!-- Card header -->
        <div class="group-card-header">
          <span class="group-name editable-name" data-group-id="${esc(group.id)}"
                title="Click to rename">${esc(group.name)}</span>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="group-count">${words.length} word${words.length !== 1 ? 's' : ''}</span>
            ${isExp ? '<span class="status-badge status-exported" title="Exported">exported</span>' : ''}
            <button class="btn btn-sm btn-danger btn-delete-group"
                    data-group-id="${esc(group.id)}" title="Delete group">🗑</button>
          </div>
        </div>

        <!-- Word list inside card -->
        <ul class="group-word-list">
          ${words.slice(0, 100).map(w => `
            <li class="group-word-item"
                draggable="true"
                data-word-id="${esc(w.id)}"
                data-group-id="${esc(group.id)}"
                title="Drag to another group">
              <span class="group-word-term">${esc((w.canonical && w.canonical.trim()) || w.word)}</span>
              <span class="group-word-trans">${esc(w.translation)}</span>
            </li>`).join('')}
          ${words.length > 100 ? `<li class="group-word-more">…and ${words.length - 100} more</li>` : ''}
        </ul>

        ${words.length === 0 ? '<p class="group-empty">Drop words here</p>' : ''}
      </div>`;
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  function bindGroupEvents(root) {
    // New group
    root.querySelector('#btn-new-group')?.addEventListener('click', createGroup);

    // Rename
    root.querySelectorAll('.editable-name').forEach(el => {
      el.addEventListener('click', onRenameClick);
    });

    // Delete group
    root.querySelectorAll('.btn-delete-group').forEach(btn => {
      btn.addEventListener('click', () => deleteGroup(btn.dataset.groupId));
    });

    // Drag start on word items
    root.querySelectorAll('.group-word-item').forEach(el => {
      el.addEventListener('dragstart', onDragStart);
    });
  }

  // ── Rename ─────────────────────────────────────────────────────────────────

  function onRenameClick(e) {
    const el      = e.currentTarget;
    const groupId = el.dataset.groupId;
    const current = el.textContent;

    const input = document.createElement('input');
    input.type      = 'text';
    input.className = 'inline-input';
    input.value     = current;
    input.style.width = '130px';

    el.replaceWith(input);
    input.focus();
    input.select();

    async function save() {
      const newName = input.value.trim() || current;
      try {
        const updated = await storage.updateGroup(groupId, { name: newName });
        const idx = allGroups.findIndex(g => g.id === groupId);
        if (idx !== -1) allGroups[idx] = updated;
      } catch (err) {
        vocDash.toast('Rename failed: ' + err.message, 'error');
      }
      render();
    }

    input.addEventListener('blur', save);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter')  input.blur();
      if (e.key === 'Escape') { input.removeEventListener('blur', save); render(); }
    });
  }

  // ── Create group ───────────────────────────────────────────────────────────

  async function createGroup() {
    const name = `Set ${allGroups.length + 1}`;
    try {
      const g = await storage.saveGroup({ name });
      allGroups.push(g);
      vocDash.toast(`Created "${name}".`, 'success');
      render();
    } catch (err) {
      vocDash.toast('Create failed: ' + err.message, 'error');
    }
  }

  // ── Delete group ───────────────────────────────────────────────────────────

  async function deleteGroup(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;
    const wordCount = allWords.filter(w => w.groupId === groupId).length;
    const msg = wordCount > 0
      ? `Delete "${group.name}" (${wordCount} words will become ungrouped)?`
      : `Delete empty group "${group.name}"?`;
    if (!confirm(msg)) return;

    try {
      await storage.deleteGroup(groupId);
      allGroups = allGroups.filter(g => g.id !== groupId);
      // Reload words so ungrouped ones reflect correctly
      allWords = await storage.getWords();
      vocDash.toast(`Deleted "${group.name}".`);
      render();
    } catch (err) {
      vocDash.toast('Delete failed: ' + err.message, 'error');
    }
  }

  // ── Drag and drop ──────────────────────────────────────────────────────────

  let dragWordId    = null;
  let dragFromGroup = null;

  function onDragStart(e) {
    dragWordId    = e.currentTarget.dataset.wordId;
    dragFromGroup = e.currentTarget.dataset.groupId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragWordId);
  }

  async function _onDrop(e, targetGroupId) {
    e.preventDefault();
    const wordId = dragWordId || e.dataTransfer.getData('text/plain');
    if (!wordId || targetGroupId === dragFromGroup) return;

    try {
      const updated = await storage.updateWord(wordId, {
        groupId: targetGroupId,
        status:  'grouped',
      });
      const idx = allWords.findIndex(w => w.id === wordId);
      if (idx !== -1) allWords[idx] = updated;
      render();
    } catch (err) {
      vocDash.toast('Move failed: ' + err.message, 'error');
    }

    dragWordId    = null;
    dragFromGroup = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  // _onDrop is called from inline ondrop handlers in the HTML, so expose it
  return { init, _onDrop };

})();
