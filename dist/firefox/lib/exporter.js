// lib/exporter.js — Quizlet Export Builder
//
// Builds a Quizlet-importable text file from a list of Word objects.
//
// Quizlet import format:
//   <term><termSep><definition><rowSep><term><termSep><definition>...
//
// Default separators (configurable in Settings):
//   termSep — TAB   (\t)   between term and definition on the same card
//   rowSep  — NEWLINE (\n) between cards
//
// In Quizlet's "Import" dialog, set:
//   "Between term and definition" → Tab
//   "Between rows"                → New line
//
// Usage:
//   const text = buildExportText(words, settings);
//   downloadAsFile(text, 'vocabular-Set-1-2026-09-02.txt');
//   // or
//   await copyToClipboard(text);

// ── Core builder ───────────────────────────────────────────────────────────────

/**
 * Builds the full export string from a list of words and settings.
 *
 * Term selection priority:
 *   1. word.canonical  — normalized form (e.g. "to play", "(adj) awesome")
 *   2. word.word       — raw saved word as fallback
 *
 * @param {Word[]} words    — words to export (from one or more groups)
 * @param {Settings} settings
 * @returns {string}
 */
function buildExportText(words, settings) {
  if (!Array.isArray(words) || words.length === 0) return '';

  const termSep = (settings && settings.exportTermSep != null)
    ? settings.exportTermSep
    : '\t';
  const rowSep = (settings && settings.exportRowSep != null)
    ? settings.exportRowSep
    : '\n';

  return words
    .map(w => {
      const term       = (w.canonical && w.canonical.trim()) || (w.word && w.word.trim()) || '';
      const definition = (w.translation && w.translation.trim()) || '';
      return `${term}${termSep}${definition}`;
    })
    .filter(line => line.trim() !== termSep.trim()) // skip completely empty lines
    .join(rowSep);
}

// ── File download ──────────────────────────────────────────────────────────────

/**
 * Triggers a file download in the browser.
 * Creates a temporary <a> element, clicks it, then revokes the object URL.
 *
 * @param {string} text      — file content
 * @param {string} filename  — suggested filename, e.g. "vocabular-Set-1-2026-09-02.txt"
 * @returns {void}
 */
function downloadAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);

  const a       = document.createElement('a');
  a.href        = url;
  a.download    = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Revoke shortly after to free memory
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// ── Clipboard copy ─────────────────────────────────────────────────────────────

/**
 * Copies text to the clipboard using the Clipboard API.
 * Returns true on success, false on failure.
 *
 * @param {string} text
 * @returns {Promise<boolean>}
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Clipboard API may be unavailable in some contexts — fall back to execCommand
    console.warn('[Vocabular] clipboard.writeText failed, trying execCommand:', err.message);
    return _copyFallback(text);
  }
}

/**
 * Legacy clipboard fallback using document.execCommand('copy').
 * @param {string} text
 * @returns {boolean}
 */
function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

// ── Filename builder ───────────────────────────────────────────────────────────

/**
 * Generates a filename for the export file.
 * Format: vocabular-<sanitized-group-name>-<YYYY-MM-DD>.txt
 *
 * @param {string} groupName  — e.g. "Set 1", "My Phrases"
 * @param {Date}   [date]     — defaults to today
 * @returns {string}          — e.g. "vocabular-Set-1-2026-09-02.txt"
 */
function buildFilename(groupName, date) {
  const d    = date || new Date();
  const iso  = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const safe = (groupName || 'export')
    .replace(/[^a-zA-Z0-9\u0400-\u04FF\s-]/g, '') // keep letters (incl. Cyrillic), digits, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-');
  return `vocabular-${safe}-${iso}.txt`;
}
