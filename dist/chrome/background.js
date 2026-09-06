// background.js — Vocabular Service Worker
//
// Handles messages from content scripts and the popup.
// All storage access goes through the storage service (lib/storage.js).
//
// Supported messages:
//
//   { action: 'save', payload: { word, translation, langFrom, langTo } }
//   → { ok: true,  word: Word }
//   → { ok: false, reason: 'duplicate' }
//   → { ok: false, reason: 'error', message: string }
//
//   { action: 'getStats' }
//   → { ok: true, total: number, pendingNormalization: number }
//
//   { action: 'getRecentWords', count?: number }
//   → { ok: true, words: Word[] }
//

// ── Cross-browser shim ────────────────────────────────────────────────────────
// In Firefox MV3 service workers the global is `browser`, not `chrome`.
// We normalise to `chrome` before anything else so storage.js can use chrome.*.
// Both checks use typeof to avoid ReferenceError if neither global exists.
(function () {
  const hasBrowser = typeof browser !== 'undefined' && browser && browser.runtime;
  const hasChrome  = typeof chrome  !== 'undefined' && chrome  && chrome.runtime;
  if (!hasChrome && hasBrowser) {
    // eslint-disable-next-line no-global-assign
    chrome = browser;
  }
  if (!hasChrome && !hasBrowser) {
    console.error('[Vocabular] background: no extension API available (chrome/browser both undefined)');
  }
})();

// ── Import shared modules ─────────────────────────────────────────────────────
// Chrome MV3 service workers use importScripts(). Firefox MV3 loads scripts
// via the manifest "scripts" array and does not support importScripts —
// so we guard with typeof to avoid errors on Firefox.
if (typeof importScripts === 'function') {
  try {
    importScripts(
      'lib/uuid.js',
      'lib/storage.js'
    );
  } catch (e) {
    console.error('[Vocabular] background: importScripts failed:', e);
  }
}

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Must return true to keep the message channel open for async responses.
  handleMessage(message, sender)
    .then(sendResponse)
    .catch(err => {
      console.error('[Vocabular] background error:', err);
      sendResponse({ ok: false, reason: 'error', message: err.message });
    });
  return true;
});

/**
 * Routes a message to the correct handler and returns a response object.
 * @param {{ action: string, payload?: any, count?: number }} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<Object>}
 */
async function handleMessage(message, sender) {
  switch (message.action) {

    case 'save':
      return handleSave(message.payload);

    case 'getStats':
      return handleGetStats();

    case 'getRecentWords':
      return handleGetRecentWords(message.count);

    default:
      return { ok: false, reason: 'unknown_action', action: message.action };
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Saves a new word after checking for duplicates.
 *
 * @param {{ word: string, translation: string, langFrom: string, langTo: string, pos?: string }} payload
 * @returns {Promise<{ ok: boolean, word?: Word, reason?: string }>}
 */
async function handleSave(payload) {
  if (!payload || !payload.word || !payload.translation) {
    return { ok: false, reason: 'invalid_payload' };
  }

  const isDup = await storage.isDuplicate(
    payload.word,
    payload.translation,
    payload.langFrom || 'en',
    payload.langTo   || 'ua'
  );

  if (isDup) {
    return { ok: false, reason: 'duplicate' };
  }

  const word = await storage.saveWord(payload);
  return { ok: true, word };
}

/**
 * Returns aggregate statistics for the popup badge / stats panel.
 * @returns {Promise<{ ok: boolean, total: number, pendingNormalization: number }>}
 */
async function handleGetStats() {
  const stats = await storage.getStats();
  return { ok: true, ...stats };
}

/**
 * Returns the N most recently saved words.
 * @param {number} [count=5]
 * @returns {Promise<{ ok: boolean, words: Word[] }>}
 */
async function handleGetRecentWords(count = 5) {
  const words = await storage.getRecentWords(count);
  return { ok: true, words };
}
