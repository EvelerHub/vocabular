// content/google_translate.js
// ISource implementation for https://translate.google.com
//
// Injects "Save" buttons next to:
//   1. The primary translation result
//   2. Each alternative translation row
//
// Uses a MutationObserver on the output panel so buttons are re-injected
// whenever Google Translate re-renders after a new translation.

(function () {
  'use strict';
  console.log("ME -> started")

  // ── Selectors ──────────────────────────────────────────────────────────────
  // Based on Google Translate's Closure/Wiz component jsname attributes.
  // jsname values are more stable than class names across deployments.

  const SEL = {
    // Source text textarea
    sourceInput:      'textarea[jsname="BJE2fc"]',
    // Main translation result span
    mainResult:       'span[jsname="W297wb"]',
    // Parent block of the main result (where we insert the Save button)
    // The result lives inside div.usGWQd > div.KkbLmb; use the outer wrapper
    mainResultBlock:  'div[jsname="r5xl4"]',
    // Language bar buttons (source and target) — tab buttons with data-language-code
    langButtons:      'button[data-language-code]',
    // Language name label inside each lang button
    langLabel:        'span[jsname="V67aGc"]',
    // The whole output panel — observed for mutations
    outputPanel:      'c-wiz[jsname="e79Xi"]',
    // Alternatives panel
    altPanel:         'ol[jsname="z5Kusc"]',
    // Alternative translation row
    altRow:           'div[jsname="r5xl4"]',
    // Cell in alt row containing the translated word
    altCell:          'span[jsname="W297wb"]',
    // Root app component — fallback observation target
    appRoot:          'c-wiz[jsrenderer="w7u1Qb"]',
    // POS label shown by Google Translate (e.g. "Іменник", "Дієслово", "Прикметник")
    posLabel:         'span.jq25U',
  };

  // Marker attribute so we don't inject duplicate buttons
  const INJECTED_ATTR = 'data-voc-injected';

  // ── Language helpers ───────────────────────────────────────────────────────

  /**
   * Reads the current source/target language codes from the page URL params.
   * Falls back to reading the visible language button labels.
   * @returns {{ langFrom: string, langTo: string }}
   */
  function getLanguages() {
    const params = new URLSearchParams(window.location.search);
    let langFrom = params.get('sl') || '';
    let langTo   = params.get('tl') || '';

    // 'auto' means Google detected the language — treat as 'en' for our purposes
    // (we're always saving English source words)
    if (!langFrom || langFrom === 'auto') langFrom = 'en';
    if (!langTo)                           langTo   = 'ua';

    return { langFrom, langTo };
  }

  /**
   * Reads the POS label from a container element (e.g. a result block or alt row)
   * and maps it to an internal POS code.
   *
   * Google Translate displays Ukrainian grammatical labels:
   *   Іменник     → noun
   *   Дієслово    → verb
   *   Прикметник  → adj
   *   Прислівник  → adv
   *
   * @param {Element} container — the DOM element to search within
   * @returns {string} POS code or '' if not found
   */
  function readPosFromContainer(container) {
    if (!container) return '';
    const label = container.querySelector(SEL.posLabel);
    if (!label) return '';
    switch (label.textContent.trim()) {
      case 'Іменник':    return 'noun';
      case 'Дієслово':   return 'verb';
      case 'Прикметник': return 'adj';
      case 'Прислівник': return 'adv';
      default:           return '';
    }
  }

  /**
   * Returns the current source text from the textarea.
   * @returns {string}
   */
  function getSourceWord() {
    const el = document.querySelector(SEL.sourceInput);
    return el ? el.value.trim() : '';
  }

  // ── Button factory ─────────────────────────────────────────────────────────

  /**
   * Creates a styled Save button bound to a specific (word, translation, pos) pair.
   * @param {string} word
   * @param {string} translation
   * @param {string} pos — pre-detected POS hint (may be '')
   * @returns {HTMLButtonElement}
   */
  function createSaveButton(word, translation, pos) {
    const btn = document.createElement('button');
    btn.className  = 'voc-save-btn';
    btn.textContent = 'Save';
    btn.title = `Save "${word}" → "${translation}"`;
    btn.setAttribute('type', 'button');

    btn.addEventListener('click', e => {
      e.stopPropagation();
      onSaveClick(btn, word, translation, pos);
    });

    return btn;
  }

  /**
   * Handles Save button click: sends message to background and updates button state.
   * @param {HTMLButtonElement} btn
   * @param {string} word
   * @param {string} translation
   * @param {string} pos — POS hint detected from the page (may be '')
   */
  function onSaveClick(btn, word, translation, pos) {
    if (!word) {
      // Source text may have been cleared — re-read
      word = getSourceWord();
    }
    if (!word || !translation) return;

    const { langFrom, langTo } = getLanguages();

    btn.classList.add('voc-sending');
    btn.textContent = '...';

    chrome.runtime.sendMessage(
      { action: 'save', payload: { word, translation, langFrom, langTo, pos: pos || '' } },
      response => {
        btn.classList.remove('voc-sending');

        if (!response) {
          // Extension context invalidated (e.g. reloaded) — reset button
          resetButton(btn, 2000);
          return;
        }

        if (response.ok) {
          btn.textContent = 'Saved ✓';
          btn.classList.add('voc-saved');
          // Update the button's bound word in case it was re-read
          btn._vocWord = word;
        } else if (response.reason === 'duplicate') {
          btn.textContent = 'Already saved';
          btn.classList.add('voc-duplicate');
        } else {
          btn.textContent = 'Error';
        }

        // After 2.5s, restore to default state
        resetButton(btn, 2500);
      }
    );
  }

  /**
   * Resets button to its default "Save" state after a delay.
   * @param {HTMLButtonElement} btn
   * @param {number} delay — milliseconds
   */
  function resetButton(btn, delay) {
    setTimeout(() => {
      btn.classList.remove('voc-saved', 'voc-duplicate', 'voc-sending');
      btn.textContent = 'Save';
    }, delay);
  }

  // ── Injection: main result ─────────────────────────────────────────────────

  /**
   * Injects a Save button next to the primary translation result.
   * Safe to call multiple times — checks INJECTED_ATTR guard.
   */
  function injectMainResultButton() {
    const resultSpan = document.querySelector(SEL.mainResult);
    
    const resultBlock = document.querySelector(SEL.mainResultBlock);
    
    if (!resultSpan || !resultBlock) return;
    const oldBtn = resultBlock.querySelector(`.voc-save-btn`)
    if (oldBtn) return;

    const translation = resultSpan.textContent.trim();
    if (!translation) return;

    const word = getSourceWord();
    if (!word) return;

    const pos = readPosFromContainer(resultBlock);
    const btn = createSaveButton(word, translation, pos);

    // Insert after the result span, inside its parent block
    resultSpan.parentNode.insertBefore(btn, resultSpan.nextSibling);
  }

  // ── Injection: alternative translations ───────────────────────────────────

  /**
   * Injects Save buttons on all alternative translation rows.
   * Safe to call multiple times — skips already-injected rows.
   */
  function injectAltRowButtons() {
    const altPanel = document.querySelector(SEL.altPanel);
    if (!altPanel) return;

    const rows = altPanel.querySelectorAll(SEL.altRow);
    rows.forEach(row => {
      if (row.hasAttribute(INJECTED_ATTR)) return;

      const cell = row.querySelector(SEL.altCell);
      if (!cell) return;

      const translation = cell.textContent.trim();
      if (!translation) return;

      const word = getSourceWord();
      if (!word) return;

      const pos = readPosFromContainer(row);
      const btn = createSaveButton(word, translation, pos);

      // Append a new <td> containing the button
      const td = document.createElement('td');
      td.className = 'voc-btn-cell';
      td.appendChild(btn);
      row.appendChild(td);

      row.setAttribute(INJECTED_ATTR, '1');
    });
  }

  // ── Main injection entry point ─────────────────────────────────────────────

  /**
   * Runs both injection routines. Called on initial load and on DOM mutations.
   */
  function injectAll() {
    injectMainResultButton();
    injectAltRowButtons();
  }

  // ── MutationObserver ───────────────────────────────────────────────────────

  let debounceTimer = null;

  /**
   * Debounced wrapper around injectAll to avoid thrashing during React re-renders.
   */
  function scheduleInject() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(injectAll, 150);
  }

  /**
   * Clears all injected buttons and INJECTED_ATTR marks.
   * Called when a new translation is detected so buttons stay fresh.
   */
  function clearInjected() {
    document.querySelectorAll(`.voc-save-btn`).forEach(btn => btn.remove());
    document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach(el => {
      el.removeAttribute(INJECTED_ATTR);
    });
    // Also remove injected <td> cells in alt rows
    document.querySelectorAll('td.voc-btn-cell').forEach(td => td.remove());
  }

  /**
   * Watches the output panel (or app root as fallback) for DOM changes.
   */
  function startObserver() {
    const target = document.querySelector(SEL.mainResultBlock);

    const observer = new MutationObserver(mutations => {
      // Check if the main result text has changed — if so, clear old buttons first
      const hasResultChange = mutations.some(m => m.target === document.querySelector(SEL.mainResultBlock));

      if (hasResultChange) {
        console.log("CHANGED");
        clearInjected();
      }

      scheduleInject();
    });

    observer.observe(target, { childList: true, subtree: true });
  }

  // ── Source input change detection ──────────────────────────────────────────

  /**
   * Listens for changes to the source textarea.
   * When the user clears or changes the input, removes stale Save buttons.
   */
  function watchSourceInput() {
    // The textarea may not exist yet — poll until it does
    const poll = setInterval(() => {
      const input = document.querySelector(SEL.sourceInput);
      if (!input) return;

      clearInterval(poll);

      let lastValue = input.value;

      const inputObserver = new MutationObserver(() => {
        if (input.value !== lastValue) {
          lastValue = input.value;
          if (!input.value.trim()) {
            clearInjected();
          }
        }
      });

      // Also listen to keyboard events
      input.addEventListener('input', () => {
        if (!input.value.trim()) {
          clearInjected();
        }
      });

      inputObserver.observe(input, { attributes: true, childList: true, characterData: true, subtree: true });
    }, 300);
  }

  // ── Boot ───────────────────────────────────────────────────────────────────

  function init() {
    // Run once in case translation is already on screen
    injectAll();
    // Watch for future DOM changes
    startObserver();
    // Watch source input for clears
    watchSourceInput();
  }

  // Google Translate is a SPA — the DOM is ready by document_idle,
  // but wait one tick for React hydration to settle
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(init, 200));
  } else {
    setTimeout(init, 200);
  }

})();
