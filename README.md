# Vocabular

A browser extension for saving translations from Google Translate, normalizing them into learner-friendly canonical forms, and exporting them to Quizlet.

No backend, no account, no network calls. Everything runs locally inside the browser.

---

## How it works

1. **Save** — Go to [translate.google.com](https://translate.google.com), type a word. A **Save** button appears next to the main translation and each alternative. Click it.
2. **Normalize** — Open the Dashboard → Words tab. Click **⚡ Normalize all raw** to auto-convert words to their canonical learning form (`playing` → `to play`, `awesome` → `(adj) awesome`, etc.).
3. **Review** — Edit canonical forms inline, set POS tags, find and resolve duplicates.
4. **Export** — Go to the Export tab, select a group, download a `.txt` file, and import it into Quizlet.

---

## Installing

### Chrome / Chromium / Edge

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `vocabular/` folder (the one containing `manifest.json`)
5. The 📖 icon appears in your toolbar

### Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select any file inside the `vocabular/` folder (e.g. `manifest.json`)
4. The extension loads for the current session (reinstall after restart)

For a persistent Firefox install, package it:
```bash
cd vocabular
zip -r vocabular.xpi . -x "*.git*" -x ".kiro/*"
```
Then load the `.xpi` via `about:addons` → gear icon → **Install Add-on From File**.

---

## Usage guide

### Saving a word

1. Go to [translate.google.com](https://translate.google.com)
2. Type a word or phrase (EN → UK or any target language)
3. Click **Save** next to the translation you want
4. The button briefly shows **Saved ✓** — word is stored locally

If you see **Already saved**, this exact word + language pair is already in your list.

### Dashboard

Click the 📖 icon in your toolbar, then **Open Dashboard** (or navigate directly to `chrome-extension://<id>/dashboard/index.html`).

#### Words tab

| Action | How |
|---|---|
| Edit canonical form | Click the cell in the Canonical column |
| Change POS | Click the POS badge |
| Normalize one word | Click ⚡ on the row |
| Normalize all raw words | **⚡ Normalize all raw** button |
| Find duplicates | **🔍 Find duplicates** — highlights matches, offers Keep / Merge / Skip |
| Delete a word | 🗑 button on the row |
| Filter | Use Status, POS dropdowns or the search box |

#### Groups tab

Words are automatically grouped in batches of 50 (configurable in Settings).

| Action | How |
|---|---|
| Rename a group | Click the group name |
| Move a word | Drag it to another group card |
| Create empty group | **+ New group** |
| Delete a group | 🗑 on the group card (words become ungrouped) |

#### Export tab

1. Check the groups you want to export
2. Review the live preview
3. Click **⬇ Download .txt** or **📋 Copy**
4. In Quizlet: **Create** → **Import** → paste/upload → set separators to match (default: Tab / New line) → **Import**

After export, words are marked `exported` and groups show their export date.

#### Settings tab

| Setting | Default | Notes |
|---|---|---|
| Words per set | 50 | How many words per Quizlet set |
| Term separator | Tab | Must match Quizlet's import dialog |
| Row separator | New line | Must match Quizlet's import dialog |
| Normalizer engine | Local | Offline, uses compromise.js |
| Dedupe engine | Local | Levenshtein distance ≤ 2 |
| OpenAI API key | — | For future AI normalization/dedup |

**Backup / Restore** — Export all data as JSON for safekeeping or cross-browser transfer. Import restores everything.

---

## Normalization rules

Normalization applies to the **English source word only**. The translation is stored as-is.

| Input | Canonical form | POS |
|---|---|---|
| `playing`, `played`, `plays` | `to play` | verb |
| `awesome`, `beautiful` | `(adj) awesome` | adj |
| `awfully`, `quickly` | `(adv) awfully` | adv |
| `dog`, `happiness` | `a dog` | noun |
| `can't help telling` | `can't help Ving` | phrase |
| `can't stand it` | `can't stand sth` | phrase |
| `keep going` | `keep Ving` | phrase |

For **uncountable nouns** (`water`, `music`): the system suggests `a water` — change it to `water (unc)` in the Canonical column by clicking to edit.

---

## Quizlet import format

Default export file looks like:

```
to play	грати
(adj) awesome	чудовий
(adv) awfully	жахливо
a dog	собака
can't help Ving	не мочи не + інфінітив
```

In Quizlet's import dialog:
- **Between term and definition** → Tab
- **Between rows** → New line

---

## Adding a new translation source (e.g. Reverso Context)

The extension has an `ISource` interface for content scripts. To add Reverso:

1. Open `content/reverso.js` — it contains step-by-step instructions
2. Add a new entry to `manifest.json` `content_scripts`:
```json
{
  "matches": ["https://context.reverso.net/*"],
  "js": ["lib/browser-polyfill.js", "content/reverso.js"],
  "css": ["content/content.css"],
  "run_at": "document_idle"
}
```
3. Add `"https://context.reverso.net/*"` to `host_permissions`
4. No changes needed to any other file

---

## Adding an AI normalizer (future)

1. Set your OpenAI API key in Settings
2. In `lib/normalizer.js`, implement the `OpenAINormalizer` class (stub is already there with instructions)
3. Change `normalizerEngine` to `'openai'` in Settings

---

## Data storage

All data lives in `chrome.storage.local` — your browser profile, never sent anywhere.

Keys used:
- `voc_words` — all saved words
- `voc_groups` — word groups
- `voc_settings` — settings

Storage limit: ~10MB (enough for tens of thousands of words). Use **Export backup** regularly.

---

## Project structure

```
vocabular/
├── manifest.json              MV3 manifest
├── background.js              Service worker — message bus
├── content/
│   ├── google_translate.js    Save buttons on translate.google.com
│   ├── reverso.js             Stub for future Reverso support
│   └── content.css            Shared button styles
├── popup/
│   ├── popup.html/css/js      Toolbar popup
├── dashboard/
│   ├── index.html             Dashboard page
│   ├── dashboard.js           Tab controller + shared utils
│   ├── dashboard.css          All dashboard styles
│   └── tabs/
│       ├── words.js           Words tab
│       ├── groups.js          Groups tab
│       ├── export.js          Export tab
│       └── settings.js        Settings tab
├── lib/
│   ├── storage.js             chrome.storage wrapper
│   ├── normalizer.js          INormalizer + LocalNormalizer
│   ├── deduplicator.js        IDuplicateDetector + LocalDeduplicator
│   ├── exporter.js            Quizlet file builder
│   ├── uuid.js                UUID generator
│   ├── compromise.min.js      Offline NLP (bundled)
│   └── browser-polyfill.js    Firefox compatibility (bundled)
└── icons/
```
