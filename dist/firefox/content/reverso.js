// content/reverso.js — Reverso Context Save Button Injection
// ISource stub — to be implemented in a future task.
//
// To add Reverso Context support:
//
// 1. Add this file to manifest.json content_scripts:
//    {
//      "matches": ["https://context.reverso.net/*"],
//      "js": ["lib/browser-polyfill.js", "content/reverso.js"],
//      "css": ["content/content.css"],
//      "run_at": "document_idle"
//    }
//
// 2. Add "https://context.reverso.net/*" to host_permissions in manifest.json.
//
// 3. Implement the ISource contract below:
//    - Set up a MutationObserver on the results container
//    - Detect result items (Reverso shows translation examples in #examples-content)
//    - For each result item, inject a <button class="voc-save-btn"> element
//    - On click, read:
//        word:        the source word from the search input (#search-input .search-term)
//        translation: the target word shown in the result item
//        langFrom:    the source language code (e.g. 'en')
//        langTo:      the target language code (e.g. 'uk')
//    - Send: chrome.runtime.sendMessage({ action: 'save', payload: { word, translation, langFrom, langTo } })
//    - Handle response { ok: true } → show "Saved ✓"
//    - Handle response { ok: false, reason: 'duplicate' } → show "Already saved"
//
// 4. The Save button should use the same .voc-save-btn CSS class (defined in content/content.css)
//    so it inherits all shared button styles automatically.

console.log('[Vocabular] reverso stub loaded — not yet implemented');
