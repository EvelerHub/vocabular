// dashboard.js — Tab controller + shared utilities
// Boots last, after all tab modules are loaded.

(function () {
  'use strict';

  // ── Tab switching ──────────────────────────────────────────────────────────

  const tabBtns   = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  function activateTab(name) {
    tabBtns.forEach(btn => {
      const active = btn.dataset.tab === name;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    tabPanels.forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab-${name}`);
    });
    // Notify the tab module so it can (re)load its data
    const event = new CustomEvent('voc:tabactivate', { detail: { tab: name } });
    document.dispatchEvent(event);
  }

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  // ── Shared utilities exposed as window.vocDash ─────────────────────────────

  window.vocDash = {

    /**
     * Shows a brief toast notification.
     * @param {string} msg
     * @param {'success'|'error'|''} [type='']
     * @param {number} [duration=2500]
     */
    toast(msg, type = '', duration = 2500) {
      let el = document.getElementById('voc-toast');
      if (!el) {
        el = document.createElement('div');
        el.id = 'voc-toast';
        el.className = 'toast';
        document.body.appendChild(el);
      }
      el.textContent = msg;
      el.className = `toast ${type}`;
      // Force reflow to restart transition
      void el.offsetWidth;
      el.classList.add('show');
      clearTimeout(el._timer);
      el._timer = setTimeout(() => el.classList.remove('show'), duration);
    },

    /**
     * Escapes a string for safe insertion into innerHTML.
     * @param {string} str
     * @returns {string}
     */
    esc(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    /**
     * Formats an ISO date string as YYYY-MM-DD.
     * @param {string} iso
     * @returns {string}
     */
    formatDate(iso) {
      if (!iso) return '';
      try { return iso.slice(0, 10); } catch (_) { return ''; }
    },

    /** Updates the word count badge in the Words tab button. */
    setWordCount(n) {
      const el = document.getElementById('tab-count-words');
      if (el) el.textContent = n > 0 ? String(n) : '';
    },

    activateTab,
  };

  // ── Boot all tab modules ───────────────────────────────────────────────────

  if (typeof wordsTab    !== 'undefined') wordsTab.init();
  if (typeof groupsTab   !== 'undefined') groupsTab.init();
  if (typeof exportTab   !== 'undefined') exportTab.init();
  if (typeof settingsTab !== 'undefined') settingsTab.init();

  // Activate the default tab
  activateTab('words');

})();
