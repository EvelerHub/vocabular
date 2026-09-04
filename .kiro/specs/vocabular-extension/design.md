# Vocabular — Technical Design

## Project Structure

```
vocabular/
├── manifest.json
├── background.js               # service worker — message bus + storage writes
├── content/
│   ├── google_translate.js     # ISource impl for translate.google.com
│   └── reverso.js              # ISource stub (future)
├── popup/
│   ├── popup.html
│   └── popup.js
├── dashboard/
│   ├── index.html
│   ├── dashboard.js            # tab controller
│   ├── tabs/
│   │   ├── words.js
│   │   ├── groups.js
│   │   ├── export.js
│   │   └── settings.js
│   └── dashboard.css
├── lib/
│   ├── storage.js              # storage service (wraps chrome.storage.local)
│   ├── normalizer.js           # INormalizer + LocalNormalizer
│   ├── deduplicator.js         # IDuplicateDetector + LocalDeduplicator
│   ├── exporter.js             # Quizlet file builder
│   ├── uuid.js                 # tiny uuid generator
│   └── compromise.min.js       # bundled NLP lib (offline)
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## Interfaces

### ISource

Implemented by each content script. Not a JS class — a plain object contract that each
content script exports via the page's message handlers.

```js
// Each content script must:
// 1. Inject Save buttons into the host page DOM
// 2. On button click, call:
chrome.runtime.sendMessage({
  action: 'save',
  payload: {
    word:        string,   // source text
    translation: string,   // chosen translation
    langFrom:    string,   // 'en'
    langTo:      string,   // 'uk'
  }
})
// 3. Handle response { ok: true } | { ok: false, reason: 'duplicate' }
```

### INormalizer

```js
// lib/normalizer.js
class INormalizer {
  // Returns a suggestion — never mutates storage directly
  async normalize(word, pos = '') {
    // → { canonical: string, pos: string }
    throw new Error('Not implemented')
  }
}
```

### IDuplicateDetector

```js
// lib/deduplicator.js
class IDuplicateDetector {
  // Returns groups of words that are likely duplicates
  async findDuplicates(words) {
    // → Array<{ words: Word[], reason: string }>
    throw new Error('Not implemented')
  }
}
```

### NormalizerFactory / DeduplicatorFactory

```js
// Returns the correct implementation based on settings.normalizerEngine
function getNormalizer(settings) { ... }
function getDeduplicator(settings) { ... }
```

---

## Storage Service

`lib/storage.js` — all other modules import from here, never touch `chrome.storage` directly.

```js
export const storage = {
  async getWords()           // → Word[]
  async saveWord(word)       // → Word  (generates id, sets savedAt, status='raw')
  async updateWord(id, patch) // → Word
  async deleteWord(id)       // → void
  async getGroups()          // → Group[]
  async saveGroup(group)     // → Group
  async updateGroup(id, patch) // → Group
  async getSettings()        // → Settings  (merges with defaults)
  async saveSettings(patch)  // → Settings
  async exportAll()          // → { words, groups, settings }  (for backup)
  async importAll(data)      // → void  (full restore)
}
```

Storage layout in `chrome.storage.local`:
```json
{
  "voc_words":    [ ...Word ],
  "voc_groups":   [ ...Group ],
  "voc_settings": { ...Settings }
}
```
Prefixed with `voc_` to avoid collisions with any other extension data.

---

## Background Service Worker

`background.js` handles messages from content scripts and popup:

```
Message: { action: 'save', payload: {...} }
  → check duplicate
  → if duplicate: reply { ok: false, reason: 'duplicate' }
  → else: storage.saveWord(payload), reply { ok: true }

Message: { action: 'getRecentWords' }
  → reply last 5 words from storage

Message: { action: 'getStats' }
  → reply { total, pendingNormalization }
```

The dashboard page communicates with `chrome.storage.local` directly (same extension origin),
it does not go through the background worker.

---

## Normalization Logic (LocalNormalizer)

Uses `compromise.js` for POS tagging. Processing pipeline for a single word/phrase:

```
Input: raw string
  │
  ├─ compromise(input).verbs().length > 0
  │    → base form via .toInfinitive()
  │    → canonical = 'to ' + base
  │    → pos = 'verb'
  │
  ├─ compromise(input).adjectives().length > 0
  │    → canonical = '(adj) ' + input
  │    → pos = 'adj'
  │
  ├─ compromise(input).adverbs().length > 0
  │    → canonical = '(adv) ' + input
  │    → pos = 'adv'
  │
  ├─ compromise(input).nouns().length > 0
  │    → canonical = 'a ' + input  (user may override to 'word (unc)')
  │    → pos = 'noun'
  │
  ├─ phrase detection (word count > 1):
  │    → gerund at end: replace last word with 'Ving'
  │    → object pronoun (it/him/her/them): replace with 'sth'
  │    → pos = 'phrase'
  │
  └─ fallback: canonical = input, pos = ''
```

Result is always a **suggestion**. The user sees it pre-filled in the dashboard and can edit.

---

## Deduplication Logic (LocalDeduplicator)

```
1. Group words where canonical (lowercased, trimmed) is exactly equal
   → reason: 'exact match'

2. For remaining words, compute pairwise Levenshtein distance on canonical
   → if distance ≤ 2 and both have same pos → group them
   → reason: 'similar spelling'

3. Return array of groups with 2+ members
```

Levenshtein is O(n²) on word count but n is small (thousands max) so it's fine in a dashboard page.

---

## Export Logic (Quizlet format)

```js
// lib/exporter.js
function buildExportText(words, settings) {
  return words
    .map(w => {
      const term = w.canonical || w.word
      return `${term}${settings.exportTermSep}${w.translation}`
    })
    .join(settings.exportRowSep)
}

function downloadAsFile(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

---

## Google Translate Content Script

The translate.google.com page is a React SPA. DOM changes as the user types.
The content script uses a `MutationObserver` to detect when translation results appear,
then injects Save buttons.

Selector targets (as of current Google Translate DOM — may need updating):
- Primary result: `[data-language-pair] c-wiz[jsname]` area with the large translated text
- Alternative translations: rows in the table under the main result

Each Save button:
```html
<button class="voc-save-btn" data-word="..." data-translation="...">Save</button>
```

State transitions:
```
default: "Save"
on click → sending...
on { ok: true } → "Saved ✓" (2s) → "Save"
on { ok: false, reason: 'duplicate' } → "Already saved" (2s) → "Save"
```

---

## Dashboard UI Structure

Single HTML page, tab-based, vanilla JS (no framework needed for this scope).

```
┌─────────────────────────────────────────────────────┐
│  Vocabular  [Words (142)] [Groups] [Export] [Settings] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  [tab content here]                                 │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Words Tab
- Filter bar: status dropdown, POS dropdown, search input
- "Normalize all raw" button
- "Find Duplicates" button  
- Table: word | translation | canonical (editable) | POS (editable select) | status | date | [delete]
- Inline edit: click canonical cell → text input; click POS → select; auto-save on blur

### Groups Tab
- Cards layout, one card per group
- Group name (editable)
- Word count badge
- Word list inside (compact)
- Drag-and-drop between groups (using HTML5 drag API)

### Export Tab
- Multi-select checkboxes for groups
- Preview textarea (read-only, live-updating)
- Download button + Copy button
- Format info line: "Using: TAB between term/definition, newline between cards"

### Settings Tab
- Group size: number input
- Term separator: radio (Tab / Comma / Dash)
- Row separator: radio (Newline / Semicolon)
- Normalizer engine: radio (Local / OpenAI — OpenAI greyed out, shows "coming soon")
- Dedupe engine: radio (same)
- OpenAI API key: password input (hidden by default)
- Export backup / Import backup buttons

---

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "Vocabular",
  "version": "1.0.0",
  "permissions": ["storage", "scripting"],
  "host_permissions": ["https://translate.google.com/*"],
  "background": { "service_worker": "background.js" },
  "content_scripts": [{
    "matches": ["https://translate.google.com/*"],
    "js": ["lib/browser-polyfill.js", "content/google_translate.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" }
  },
  "web_accessible_resources": [{
    "resources": ["dashboard/index.html"],
    "matches": ["<all_urls>"]
  }]
}
```

---

## Firefox Compatibility

- Use `webextension-polyfill` (Mozilla's official shim) bundled as `lib/browser-polyfill.js`
- All code uses `chrome.*` — polyfill maps it to `browser.*` in Firefox
- Firefox packaging: add `browser_specific_settings` to manifest, zip as `.xpi`
- No code changes required between Chrome and Firefox builds

---

## Future Extension Points

| Feature | What to add |
|---|---|
| Reverso Context | `content/reverso.js` implementing the save message contract |
| OpenAI normalizer | `OpenAINormalizer extends INormalizer`, registered in `getNormalizer()` |
| OpenAI deduplicator | `OpenAIDeduplicator extends IDuplicateDetector` |
| Backend sync | Storage service gets an optional sync layer behind a feature flag |
| Anki export | `lib/exporter.js` gets an `exportAnki()` function alongside `exportQuizlet()` |
