// popup.js — Vocabular popup controller
//
// Reads data from the background service worker (not from chrome.storage directly)
// to avoid duplicating storage logic in the popup.
// Renders: stats bar (total / pending normalization) + last 5 saved words.

(function () {
  'use strict';

  // ── Cross-browser shim ───────────────────────────────────────────────────
  // Firefox content scripts expose `browser`; Chrome exposes `chrome`.
  // The polyfill handles most cases but this guards against edge cases.
  if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    // eslint-disable-next-line no-global-assign
    chrome = browser;
  }

  // ── DOM refs ──────────────────────────────────────────────────────────────

  const statTotal     = document.getElementById('stat-total');
  const statPending   = document.getElementById('stat-pending');
  const recentList    = document.getElementById('recent-list');
  const btnDashboard  = document.getElementById('btn-dashboard');
  const btnDashFooter = document.getElementById('btn-dashboard-footer');

  // ── Open dashboard ─────────────────────────────────────────────────────────

  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard/index.html') });
    window.close(); // close the popup
  }

  btnDashboard.addEventListener('click',  openDashboard);
  btnDashFooter.addEventListener('click', openDashboard);

  // ── Message helpers ────────────────────────────────────────────────────────

  function sendMessage(message) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(message, response => {
        if (chrome.runtime.lastError) {
          // Background worker may not be ready yet
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
  }

  // ── Render stats ───────────────────────────────────────────────────────────

  function renderStats(total, pending) {
    statTotal.textContent   = total   != null ? total   : '—';
    statPending.textContent = pending != null ? pending : '—';

    // Highlight pending count when there are words to normalize
    statPending.style.color = (pending > 0) ? '#c5221f' : '#1a73e8';
  }

  // ── Render recent words ────────────────────────────────────────────────────

  /**
   * @param {Word[]} words — ordered most-recent first
   */
  function renderRecentWords(words) {
    recentList.innerHTML = '';

    if (!words || words.length === 0) {
      const li = document.createElement('li');
      li.className = 'word-item empty';
      li.textContent = 'No words saved yet.';
      recentList.appendChild(li);
      return;
    }

    words.forEach(w => {
      const li = document.createElement('li');
      li.className = 'word-item';

      // Term — show canonical if available, otherwise raw word
      const term = (w.canonical && w.canonical.trim()) || w.word;

      li.innerHTML = `
        <span class="word-term">${escHtml(term)}</span>
        <span class="word-arrow">→</span>
        <span class="word-translation">${escHtml(w.translation)}</span>
        <span class="word-status ${escHtml(w.status)}">${escHtml(w.status)}</span>
      `;

      recentList.appendChild(li);
    });
  }

  // ── Escape HTML ────────────────────────────────────────────────────────────

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Load data ──────────────────────────────────────────────────────────────

  async function load() {
    // Fire both requests in parallel
    const [statsResp, recentResp] = await Promise.all([
      sendMessage({ action: 'getStats' }),
      sendMessage({ action: 'getRecentWords', count: 5 }),
    ]);

    if (statsResp && statsResp.ok) {
      renderStats(statsResp.total, statsResp.pendingNormalization);
    } else {
      renderStats(0, 0);
    }

    if (recentResp && recentResp.ok) {
      renderRecentWords(recentResp.words);
    } else {
      renderRecentWords([]);
    }
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  load();

})();
