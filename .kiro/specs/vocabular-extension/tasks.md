# Vocabular — Implementation Tasks

## Task 01 — Project Scaffold & Manifest

- [ ] Create directory structure: `content/`, `popup/`, `dashboard/tabs/`, `lib/`, `icons/`
- [ ] Create `manifest.json` (MV3, permissions: storage, scripting, host: translate.google.com)
- [ ] Add placeholder icon files (simple colored squares) at 16×16, 48×48, 128×128
- [ ] Download and bundle `compromise.min.js` into `lib/`
- [ ] Download and bundle `webextension-polyfill` into `lib/browser-polyfill.js`

**Acceptance:** Extension loads in Chrome without errors (chrome://extensions → Load unpacked)

---

## Task 02 — Storage Service

- [ ] Create `lib/uuid.js` — generates RFC4122 v4 UUIDs without external deps
- [ ] Create `lib/storage.js` with the full storage service API:
  - `getWords`, `saveWord`, `updateWord`, `deleteWord`
  - `getGroups`, `saveGroup`, `updateGroup`
  - `getSettings`, `saveSettings`
  - `exportAll`, `importAll`
- [ ] Define and export TypeScript-style JSDoc type annotations for `Word`, `Group`, `Settings`
- [ ] Default settings must be merged on `getSettings()` so missing keys are never undefined

**Acceptance:** Can call `storage.saveWord({...})` from the browser console on any extension page and verify the entry appears in `chrome.storage.local` via DevTools.

---

## Task 03 — Background Service Worker

- [ ] Create `background.js`
- [ ] Handle message `{ action: 'save', payload }`:
  - Check duplicate: same `word` + `langFrom` + `langTo` already in storage
  - If duplicate: reply `{ ok: false, reason: 'duplicate' }`
  - Else: call `storage.saveWord(payload)`, reply `{ ok: true, word }`
- [ ] Handle message `{ action: 'getRecentWords' }` → last 5 by `savedAt`
- [ ] Handle message `{ action: 'getStats' }` → `{ total, pendingNormalization }`

**Acceptance:** Send messages from DevTools console, verify correct responses.

---

## Task 04 — Google Translate Content Script

- [ ] Create `content/google_translate.js`
- [ ] Set up `MutationObserver` watching the translation result container
- [ ] Detect primary translation result element and inject a Save button
- [ ] Detect alternative translation rows and inject a Save button on each
- [ ] Read `word` (source input), `translation` (target text), `langFrom`, `langTo` from the page
- [ ] On Save button click: send `{ action: 'save', payload }` to background
- [ ] Handle response states: default / sending / "Saved ✓" / "Already saved"
- [ ] Style the button with inline styles (minimal, unobtrusive, matches page aesthetics)
- [ ] Create `content/reverso.js` as a stub with comments describing the required implementation

**Acceptance:** Open translate.google.com, type a word, Save buttons appear next to the result and alternatives. Clicking saves to storage. Duplicate click shows "Already saved".

---

## Task 05 — Normalizer

- [ ] Create `lib/normalizer.js`
- [ ] Define `INormalizer` base class with `normalize(word, pos)` method
- [ ] Implement `LocalNormalizer extends INormalizer`:
  - Verb detection + `to <infinitive>` form
  - Adjective detection + `(adj) <word>`
  - Adverb detection + `(adv) <word>`
  - Noun detection + `a <word>` (with `pos = 'noun'` so user can override to `(unc)`)
  - Phrase detection: gerund replacement with `Ving`, object pronoun with `sth`
  - Fallback: return as-is
- [ ] Export `getNormalizer(settings)` factory function
- [ ] Add `OpenAINormalizer` class stub with `// TODO: implement` and a note about required settings

**Acceptance:** Unit-test in browser console:
- `normalizer.normalize('playing')` → `{ canonical: 'to play', pos: 'verb' }`
- `normalizer.normalize('awesome')` → `{ canonical: '(adj) awesome', pos: 'adj' }`
- `normalizer.normalize("can't help telling")` → `{ canonical: "can't help Ving", pos: 'phrase' }`

---

## Task 06 — Deduplicator

- [ ] Create `lib/deduplicator.js`
- [ ] Define `IDuplicateDetector` base class with `findDuplicates(words)` method
- [ ] Implement Levenshtein distance function (pure JS, no deps)
- [ ] Implement `LocalDeduplicator extends IDuplicateDetector`:
  - Pass 1: exact canonical match (case-insensitive)
  - Pass 2: Levenshtein ≤ 2 on canonical, same POS
  - Return `Array<{ words: Word[], reason: string }>`
- [ ] Export `getDeduplicator(settings)` factory function
- [ ] Add `OpenAIDeduplicator` stub

**Acceptance:** Call `deduplicator.findDuplicates([...])` with hand-crafted duplicates in console, verify groups returned.

---

## Task 07 — Exporter

- [ ] Create `lib/exporter.js`
- [ ] Implement `buildExportText(words, settings)` → string
  - Uses `canonical || word` as term
  - Applies `exportTermSep` and `exportRowSep` from settings
- [ ] Implement `downloadAsFile(text, filename)` using Blob + object URL
- [ ] Implement `copyToClipboard(text)` using `navigator.clipboard.writeText`
- [ ] Filename format: `vocabular-<groupName>-<YYYY-MM-DD>.txt`

**Acceptance:** Call `buildExportText([...], settings)` in console, verify tab-separated output.

---

## Task 08 — Popup

- [ ] Create `popup/popup.html` — minimal layout: stats, recent words list, open dashboard button
- [ ] Create `popup/popup.js`:
  - On load: send `getStats` and `getRecentWords` to background
  - Render total count, pending normalization count
  - Render last 5 words as `word → translation` lines
  - "Open Dashboard" button opens `dashboard/index.html` in a new tab
- [ ] Style with `popup/popup.css` — clean, minimal, ~320px wide

**Acceptance:** Click extension icon, popup shows correct counts and recent words.

---

## Task 09 — Dashboard: Shell & Words Tab

- [ ] Create `dashboard/index.html` — tab bar + content area shell
- [ ] Create `dashboard/dashboard.js` — tab switching controller
- [ ] Create `dashboard/dashboard.css` — base styles, table styles, button styles
- [ ] Create `dashboard/tabs/words.js`:
  - Load all words from storage
  - Render table with columns: word, translation, canonical, POS, status, date, actions
  - Filter bar: status, POS, search
  - Inline edit for `canonical` (click-to-edit text input)
  - Inline edit for `pos` (click-to-edit select)
  - Auto-save on blur/change
  - Delete button per row
  - "Normalize" button per row (calls `INormalizer`, pre-fills canonical + pos)
  - "Normalize all raw" bulk button
  - "Find Duplicates" button → highlights duplicate groups with merge/keep/delete actions

**Acceptance:** Open dashboard, see word list, edit a canonical field, verify it persists after page reload.

---

## Task 10 — Dashboard: Groups Tab

- [ ] Create `dashboard/tabs/groups.js`:
  - Read words and settings from storage
  - Auto-partition words by `savedAt` into groups of `settings.groupSize`
  - Render each group as a card: name (editable), word count, word list (compact)
  - Create/persist group records in storage when auto-partitioning
  - Allow renaming group (click name → input, save on blur)
  - HTML5 drag-and-drop to move words between groups (updates `word.groupId`)
  - Exported groups visually distinct (muted color)

**Acceptance:** Words are auto-partitioned, groups can be renamed, words can be dragged between groups.

---

## Task 11 — Dashboard: Export Tab

- [ ] Create `dashboard/tabs/export.js`:
  - List groups with checkbox selection
  - Live preview textarea — updates on selection change
  - Shows active format settings inline: "Tab-separated, newline between cards"
  - "Download .txt" button — calls `exporter.downloadAsFile`
  - "Copy to clipboard" button — calls `exporter.copyToClipboard`
  - After export: update `word.status = 'exported'` and `group.exportedAt` in storage

**Acceptance:** Select a group, see preview, download file, open in text editor and verify format.

---

## Task 12 — Dashboard: Settings Tab

- [ ] Create `dashboard/tabs/settings.js`:
  - Form for all `Settings` fields with labels and current values
  - Group size: number input (min 1, max 500)
  - Term separator: radio buttons (Tab / Comma / Dash)
  - Row separator: radio buttons (Newline / Semicolon)
  - Normalizer engine: radio (Local selected; OpenAI shows "(coming soon)" disabled)
  - Dedupe engine: radio (same)
  - OpenAI API key: password input, hidden by default, toggle show/hide
  - Auto-save settings on every change (debounced 500ms)
  - "Export backup (JSON)" button → downloads full storage export
  - "Import backup" button → file picker, reads JSON, calls `storage.importAll`, reloads page

**Acceptance:** Change group size to 10, reload dashboard, verify Groups tab now shows groups of 10.

---

## Task 13 — End-to-End Smoke Test & Polish

- [ ] Test full flow: save word on Google Translate → view in popup → open dashboard → normalize → export
- [ ] Verify no `console.error` on any extension page
- [ ] Verify extension works in Firefox (load as temporary add-on via about:debugging)
- [ ] Write `README.md`:
  - How to load in Chrome (Load unpacked)
  - How to load in Firefox (about:debugging → Load Temporary Add-on)
  - How to use: save → dashboard → normalize → export → import to Quizlet
  - How to do a JSON backup/restore
  - How to add a new source site (ISource pattern)
