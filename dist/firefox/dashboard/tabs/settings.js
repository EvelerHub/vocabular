// dashboard/tabs/settings.js — Settings Tab
//
// Features:
//   - Group size input
//   - Term separator (Tab / Comma / Dash)
//   - Row separator (New line / Semicolon)
//   - Normalizer engine selector (Local / OpenAI — OpenAI disabled with "coming soon")
//   - Dedupe engine selector (same)
//   - OpenAI API key (password field, show/hide toggle)
//   - Auto-save on every change (debounced 500ms)
//   - Export full JSON backup
//   - Import JSON backup

/* global storage, vocDash */

const settingsTab = (function () {
  'use strict';

  let settings  = {};
  let saveTimer = null;

  // ── Init ───────────────────────────────────────────────────────────────────

  function init() {
    document.addEventListener('voc:tabactivate', e => {
      if (e.detail.tab === 'settings') reload();
    });
  }

  async function reload() {
    settings = await storage.getSettings();
    render();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function render() {
    const root = document.getElementById('settings-root');
    if (!root) return;

    const s   = settings;
    const esc = vocDash.esc;

    const termSep = s.exportTermSep === '\t' ? 'tab'
                  : s.exportTermSep === ',' ? 'comma' : 'dash';
    const rowSep  = s.exportRowSep  === '\n' ? 'newline' : 'semicolon';

    root.innerHTML = `
      <div class="settings-layout">

        <!-- Grouping -->
        <section class="settings-section">
          <div class="settings-section-title">Grouping</div>

          <div class="settings-row">
            <label class="settings-label" for="set-group-size">
              Words per Quizlet set
              <span class="settings-hint">Words are auto-grouped in this batch size</span>
            </label>
            <input type="number" id="set-group-size" class="input settings-input-sm"
                   min="1" max="500" value="${esc(String(s.groupSize || 50))}">
          </div>
        </section>

        <!-- Export format -->
        <section class="settings-section">
          <div class="settings-section-title">Quizlet Export Format</div>

          <div class="settings-row">
            <label class="settings-label">
              Between term and definition
              <span class="settings-hint">Set the same in Quizlet's import dialog</span>
            </label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="term-sep" value="tab" ${termSep === 'tab' ? 'checked' : ''}> Tab
              </label>
              <label class="settings-radio">
                <input type="radio" name="term-sep" value="comma" ${termSep === 'comma' ? 'checked' : ''}> Comma
              </label>
              <label class="settings-radio">
                <input type="radio" name="term-sep" value="dash" ${termSep === 'dash' ? 'checked' : ''}> Dash
              </label>
            </div>
          </div>

          <div class="settings-row">
            <label class="settings-label">
              Between cards
              <span class="settings-hint">Set the same in Quizlet's import dialog</span>
            </label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="row-sep" value="newline" ${rowSep === 'newline' ? 'checked' : ''}> New line
              </label>
              <label class="settings-radio">
                <input type="radio" name="row-sep" value="semicolon" ${rowSep === 'semicolon' ? 'checked' : ''}> Semicolon
              </label>
            </div>
          </div>
        </section>

        <!-- Normalization engine -->
        <section class="settings-section">
          <div class="settings-section-title">Normalization Engine</div>

          <div class="settings-row">
            <label class="settings-label">
              Engine
              <span class="settings-hint">Controls how raw words are converted to canonical form</span>
            </label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="norm-engine" value="local"
                       ${s.normalizerEngine !== 'openai' ? 'checked' : ''}> Local (offline, compromise.js)
              </label>
              <label class="settings-radio settings-radio-disabled">
                <input type="radio" name="norm-engine" value="openai" disabled> OpenAI
                <span class="settings-coming-soon">coming soon</span>
              </label>
            </div>
          </div>
        </section>

        <!-- Deduplication engine -->
        <section class="settings-section">
          <div class="settings-section-title">Duplicate Detection Engine</div>

          <div class="settings-row">
            <label class="settings-label">
              Engine
              <span class="settings-hint">Controls how duplicate words are detected</span>
            </label>
            <div class="settings-radio-group">
              <label class="settings-radio">
                <input type="radio" name="dedup-engine" value="local"
                       ${s.dedupeEngine !== 'openai' ? 'checked' : ''}> Local (Levenshtein distance)
              </label>
              <label class="settings-radio settings-radio-disabled">
                <input type="radio" name="dedup-engine" value="openai" disabled> OpenAI (semantic)
                <span class="settings-coming-soon">coming soon</span>
              </label>
            </div>
          </div>
        </section>

        <!-- OpenAI API Key -->
        <section class="settings-section" id="section-openai">
          <div class="settings-section-title">OpenAI API Key</div>
          <div class="settings-row">
            <label class="settings-label" for="set-openai-key">
              API Key
              <span class="settings-hint">
                Stored locally, never sent anywhere except OpenAI.
                Only used when an OpenAI engine is selected above.
              </span>
            </label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="password" id="set-openai-key" class="input settings-input-lg"
                     placeholder="sk-…" value="${esc(s.openaiApiKey || '')}">
              <button id="btn-toggle-key" class="btn btn-sm" title="Show/hide key">👁</button>
            </div>
          </div>
        </section>

        <!-- Data -->
        <section class="settings-section">
          <div class="settings-section-title">Data</div>

          <div class="settings-row">
            <label class="settings-label">
              Backup / Restore
              <span class="settings-hint">
                Export your full word list as JSON for backup or cross-browser transfer.
              </span>
            </label>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button id="btn-export-backup" class="btn">⬇ Export backup (.json)</button>
              <label class="btn" style="cursor:pointer" title="Import a previously exported JSON backup">
                ⬆ Import backup
                <input type="file" id="input-import" accept=".json" style="display:none">
              </label>
            </div>
          </div>

          <div class="settings-row settings-row-danger">
            <label class="settings-label">
              Danger zone
              <span class="settings-hint">These actions cannot be undone.</span>
            </label>
            <button id="btn-clear-all" class="btn btn-danger">🗑 Delete all data</button>
          </div>
        </section>

        <div id="settings-save-indicator" class="settings-save-indicator"></div>

      </div>`;

    bindSettingsEvents(root);
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  function bindSettingsEvents(root) {
    // Group size
    root.querySelector('#set-group-size')?.addEventListener('input', e => {
      const v = parseInt(e.target.value);
      if (v >= 1 && v <= 500) scheduleSave({ groupSize: v });
    });

    // Term separator
    root.querySelectorAll('input[name="term-sep"]').forEach(r => {
      r.addEventListener('change', () => {
        const map = { tab: '\t', comma: ',', dash: '-' };
        scheduleSave({ exportTermSep: map[r.value] || '\t' });
      });
    });

    // Row separator
    root.querySelectorAll('input[name="row-sep"]').forEach(r => {
      r.addEventListener('change', () => {
        scheduleSave({ exportRowSep: r.value === 'semicolon' ? ';' : '\n' });
      });
    });

    // Normalizer engine
    root.querySelectorAll('input[name="norm-engine"]').forEach(r => {
      r.addEventListener('change', () => scheduleSave({ normalizerEngine: r.value }));
    });

    // Dedup engine
    root.querySelectorAll('input[name="dedup-engine"]').forEach(r => {
      r.addEventListener('change', () => scheduleSave({ dedupeEngine: r.value }));
    });

    // OpenAI key
    root.querySelector('#set-openai-key')?.addEventListener('input', e => {
      scheduleSave({ openaiApiKey: e.target.value });
    });

    // Toggle key visibility
    root.querySelector('#btn-toggle-key')?.addEventListener('click', () => {
      const input = root.querySelector('#set-openai-key');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });

    // Export backup
    root.querySelector('#btn-export-backup')?.addEventListener('click', exportBackup);

    // Import backup
    root.querySelector('#input-import')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) importBackup(file);
      e.target.value = ''; // reset so same file can be re-imported
    });

    // Delete all
    root.querySelector('#btn-clear-all')?.addEventListener('click', clearAll);
  }

  // ── Auto-save ──────────────────────────────────────────────────────────────

  function scheduleSave(patch) {
    Object.assign(settings, patch);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistSettings(), 500);
    showSaveIndicator('Saving…');
  }

  async function persistSettings() {
    try {
      settings = await storage.saveSettings(settings);
      showSaveIndicator('Saved ✓', 'success');
    } catch (err) {
      showSaveIndicator('Save failed', 'error');
    }
  }

  function showSaveIndicator(msg, type = '') {
    const el = document.getElementById('settings-save-indicator');
    if (!el) return;
    el.textContent = msg;
    el.className = `settings-save-indicator ${type}`;
    if (type === 'success') {
      setTimeout(() => { el.textContent = ''; el.className = 'settings-save-indicator'; }, 2000);
    }
  }

  // ── Export backup ──────────────────────────────────────────────────────────

  async function exportBackup() {
    try {
      const data = await storage.exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `vocabular-backup-${date}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      vocDash.toast('Backup downloaded.', 'success');
    } catch (err) {
      vocDash.toast('Backup failed: ' + err.message, 'error');
    }
  }

  // ── Import backup ──────────────────────────────────────────────────────────

  async function importBackup(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.words || !Array.isArray(data.words)) {
        throw new Error('Invalid backup file — missing words array.');
      }
      if (!confirm(`This will replace ALL current data with ${data.words.length} words from the backup. Continue?`)) return;
      await storage.importAll(data);
      settings = await storage.getSettings();
      vocDash.toast(`Imported ${data.words.length} words.`, 'success');
      render();
    } catch (err) {
      vocDash.toast('Import failed: ' + err.message, 'error');
    }
  }

  // ── Clear all data ─────────────────────────────────────────────────────────

  async function clearAll() {
    if (!confirm('Delete ALL saved words, groups, and settings? This cannot be undone.')) return;
    if (!confirm('Are you sure? This will permanently delete everything.')) return;
    try {
      await storage.importAll({ words: [], groups: [], settings: {} });
      settings = await storage.getSettings();
      vocDash.toast('All data deleted.', 'success');
      render();
    } catch (err) {
      vocDash.toast('Clear failed: ' + err.message, 'error');
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return { init };

})();
