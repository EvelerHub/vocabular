# Vocabular — Browser Extension Requirements

## Background

The user learns English and occasionally checks word translations on `translate.google.com`.
Currently the workflow is: screenshot the word → later review screenshots → manually convert to
canonical form → build a Quizlet set. This extension automates that entire pipeline inside the browser
with no backend, no install step beyond loading the extension.

---

## Requirements

### REQ-01 — Save Button Injection (Google Translate)

1. The extension SHALL inject a **"Save"** button next to:
   - The primary translation result (right-hand panel)
   - Each alternative translation option listed below the primary result
2. The button SHALL be visually unobtrusive and match the host page style.
3. Clicking Save SHALL capture:
   - `word` — the source text as typed by the user
   - `translation` — the specific translation that was clicked
   - `langFrom` — source language code (default `"en"`)
   - `langTo` — target language code (e.g. `"ua"`, `"ru"`)
   - `pos` — part of speech read directly from the Google Translate UI label (see REQ-04)
   - `savedAt` — ISO timestamp
4. After saving, the button SHALL briefly show a confirmation state ("Saved ✓") then return to normal.
5. If the same `(word, translation, langFrom, langTo)` tuple already exists in storage, the button
   SHALL show "Already saved" instead of saving a duplicate.
   Rationale: one source word can have multiple valid translations (e.g. "bank" → "банк" and
   "bank" → "берег"); each distinct translation is a separate vocabulary entry and SHALL be
   saved independently. Duplicate detection MUST include `translation` — matching on `word` alone
   is incorrect.

### REQ-02 — Source Abstraction

1. The Google Translate integration SHALL implement an `ISource` interface so that future sources
   (e.g. Reverso Context) can be added by creating a new content script and registering it in
   `manifest.json` without modifying any shared code.
2. A stub file `content/reverso.js` SHALL be created as a placeholder with comments describing
   what needs to be implemented.

### REQ-03 — Storage

1. All data SHALL be stored in `chrome.storage.local`.
2. The storage schema SHALL be:
   ```
   words:    Word[]
   groups:   Group[]
   settings: Settings
   ```
3. The `Word` object:
   ```
   id          string   uuid
   word        string   raw source word as saved
   translation string   raw translation as saved
   langFrom    string
   langTo      string
   canonical   string   normalized form (initially empty)
   pos         string   'verb'|'adj'|'adv'|'noun'|'phrase'|''
   status      string   'raw'|'normalized'|'grouped'|'exported'
   groupId     string|null
   savedAt     string   ISO datetime
   notes       string
   ```
4. The `Group` object:
   ```
   id          string
   name        string
   createdAt   string
   exportedAt  string|null
   ```
5. The `Settings` object:
   ```
   groupSize           number   default 50
   exportTermSep       string   default '\t'
   exportRowSep        string   default '\n'
   normalizerEngine    string   'local' (future: 'openai')
   dedupeEngine        string   'local' (future: 'openai')
   openaiApiKey        string   default ''
   ```
6. A storage service module SHALL wrap all reads and writes so no other module calls
   `chrome.storage` directly.

### REQ-04 — Normalization

1. The extension SHALL provide a `INormalizer` interface with a single method:
   `normalize(word: string, pos?: string, translation?: string): Promise<{ canonical: string, pos: string }>`
2. A `LocalNormalizer` SHALL implement `INormalizer` using `compromise.js` (bundled, offline).
3. Normalization rules for the **English source word**:
   - Verb (any conjugation) → `to <base form>`  e.g. `playing` → `to play`
   - Adjective → `(adj) <word>`  e.g. `awesome` → `(adj) awesome`
   - Adverb → `(adv) <word>`  e.g. `awfully` → `(adv) awfully`
   - Countable noun → `a <word>`  e.g. `dog` → `a dog`
   - Uncountable noun → system suggests `a <word>`, user can override to `<word> (unc)` in dashboard
   - Phrase ending in gerund → replace gerund with `Ving`  e.g. `can't help telling` → `can't help Ving`
   - Phrase containing object pronoun (it/him/her/them/sth) → replace with `sth`
     e.g. `can't stand it` → `can't stand sth`
4. **POS detection from Google Translate UI:** Google Translate displays a grammatical label
   (`span.jq25U`) next to each translation. The content script SHALL read this label at save time
   and store it as the `pos` field, using the following mapping:

   | Ukrainian label | Internal POS |
   |---|---|
   | Іменник    | `noun` |
   | Дієслово   | `verb` |
   | Прикметник | `adj`  |
   | Прислівник | `adv`  |
   | (not shown) | `''`  |

   This gives the normalizer an authoritative POS hint before any NLP is run. When `pos` is
   already set on a word, the normalizer SHALL use `_normalizeWithHint` and skip NLP detection
   entirely — eliminating ambiguity errors such as "bank" (noun) being normalized as "to bank".
5. **Translation-assisted POS fallback:** if no POS label was captured at save time (e.g. for
   words saved before this feature, or for sources that don't expose a label), the normalizer
   SHALL fall back to compromise.js NLP on the English word. When the word is ambiguous (tagged
   as both verb and noun), morphological heuristics on the translation string MAY be used as a
   secondary tiebreaker.
6. The Ukrainian/Russian translation side SHALL NOT be normalized into canonical form.
7. Normalization SHALL always produce a **suggestion**. The user confirms or overrides in the dashboard.
8. The normalizer engine SHALL be swappable via the `normalizerEngine` setting without changing
   any calling code (open/closed principle).

### REQ-05 — Duplicate Detection

1. The extension SHALL provide an `IDuplicateDetector` interface:
   `findDuplicates(words: Word[]): Promise<DuplicateGroup[]>`
   where `DuplicateGroup = { words: Word[], reason: string }`.
2. A `LocalDeduplicator` SHALL implement `IDuplicateDetector` using:
   - Exact match on normalized `canonical` (case-insensitive)
   - Levenshtein distance ≤ 2 on `canonical` as a near-duplicate signal
3. The deduplication engine SHALL be swappable via `dedupeEngine` setting.
4. Duplicate resolution (merge / keep both / delete) SHALL be done manually by the user in the
   dashboard.

### REQ-06 — Dashboard: Words Tab

1. The dashboard SHALL be a full extension page (`dashboard/index.html`) opened from the popup.
2. The Words tab SHALL display all saved words in a table with columns:
   `(checkbox) | word | translation | canonical | POS | status | saved date | actions`
3. The user SHALL be able to:
   - Edit `canonical` and `pos` inline
   - Trigger "Normalize" on a single word (runs `INormalizer`)
   - Trigger "Normalize all raw" (bulk)
   - Delete a word
   - Add a manual note
4. A "Find Duplicates" button SHALL run `IDuplicateDetector` and highlight duplicate groups.
   For each group the user can: keep one, merge (concatenate notes), or delete extras.
5. **Bulk delete — select and delete:**
   - Each row SHALL have a checkbox. A header checkbox SHALL select / deselect all currently
     visible rows (respecting active filters).
   - When one or more rows are selected, a **"Delete selected (N)"** button SHALL appear in
     the toolbar. Clicking it SHALL prompt for confirmation then delete only the selected words
     in a single storage write.
6. **Delete All:**
   - A **"Delete all"** button SHALL always be visible in the toolbar.
   - If filters are active, it SHALL delete only the words currently visible (matching the
     filter), with a confirmation message stating how many words will be deleted.
   - If no filters are active, it SHALL delete every word in storage, with a confirmation
     message warning that this cannot be undone.
   - Both "Delete selected" and "Delete all" SHALL use a single `storage.deleteWords(ids)`
     call rather than looping over `storage.deleteWord(id)` to avoid unnecessary storage writes.

### REQ-07 — Dashboard: Groups Tab

1. The Groups tab SHALL show words auto-partitioned into groups of `settings.groupSize`.
2. Words are grouped in order of `savedAt` (oldest first).
3. The user SHALL be able to rename groups and manually move words between groups.
4. Words with `status = 'exported'` SHALL be visually distinguished.

### REQ-08 — Dashboard: Export Tab

1. The user SHALL be able to select one or more groups to export.
2. A live preview SHALL show the exact text that will be written to the file.
3. Export format:
   - Each line: `<canonical><termSep><translation>`
   - Lines separated by `rowSep`
   - If `canonical` is empty, fall back to `word`
4. Download SHALL produce a `.txt` file named `vocabular-<groupName>-<date>.txt`.
5. A "Copy to clipboard" button SHALL also be available.
6. After export, all included words SHALL have their `status` set to `'exported'`
   and the group's `exportedAt` SHALL be updated.

### REQ-09 — Dashboard: Settings Tab

1. The Settings tab SHALL expose all `Settings` fields as form inputs with labels and defaults shown.
2. Settings SHALL be saved to `chrome.storage.local` on change (debounced).
3. A "Export all data (backup)" button SHALL download the full storage as a JSON file.
4. A "Import backup" button SHALL restore from a previously exported JSON file.

### REQ-10 — Popup

1. The popup (`popup/popup.html`) SHALL show:
   - Count of total saved words
   - Count of words pending normalization
   - The last 5 saved words
   - A button to open the dashboard
2. The popup SHALL NOT duplicate storage logic — it reads from the storage service.

### REQ-11 — Browser Compatibility

1. The extension SHALL use Manifest V3.
2. It SHALL work in Chrome and Chromium-based browsers without modification.
3. It SHALL work in Firefox (109+) using the same JS codebase with a different manifest:
   - `manifest.chrome.json` — uses `background.service_worker` (Chrome MV3 requirement)
   - `manifest.firefox.json` — uses `background.scripts` array (Firefox MV3 requirement,
     which does not support `importScripts` in service workers)
   - `build.sh` copies the correct manifest as `manifest.json` into `dist/chrome/` or
     `dist/firefox/` for loading as an unpacked extension
4. All JS files SHALL resolve the extension API using a local `ext` variable or an inline
   shim before calling any `chrome.*` APIs, to handle Firefox exposing `browser` instead
   of `chrome` in some contexts.
5. The `lib/browser-polyfill.js` (webextension-polyfill) SHALL be loaded in content scripts,
   popup, and dashboard via `<script>` tags or the manifest `js` array. It SHALL NOT be
   loaded in the background service worker (it throws when `chrome.runtime` is absent).
6. No code changes are required when switching between Chrome and Firefox builds — only
   the manifest file differs.

### REQ-12 — No External Network Calls

1. In default configuration, the extension SHALL make zero network requests.
2. All logic (NLP, dedup) SHALL run entirely offline.
3. The OpenAI API key field SHALL only be used when the user explicitly configures it and
   switches the engine setting. No key → no calls.
