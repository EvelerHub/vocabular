# Vocabular

A browser extension for saving translations from Google Translate, normalizing them into learner-friendly canonical forms, and exporting them to Quizlet.

Works in **Firefox** and **Chrome / Chromium / Edge**. No backend, no account, no network calls. Everything runs locally inside the browser.

---

## Download

Get the latest release from the [**Releases page**](../../releases/latest).

### Chrome / Chromium / Edge

1. Download `vocabular-chrome-x.x.x.zip` and **unzip** it
2. Go to `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the unzipped folder
5. The 📖 icon appears in your toolbar

### Firefox

> Firefox requires extensions to be signed for permanent installation. For local use, the temporary method below works without signing and survives across sessions as long as you don't restart Firefox.

1. Download `vocabular-firefox-x.x.x.zip` *(do not unzip)*
2. Go to `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** → select the `.zip` file
4. The 📖 icon appears in your toolbar

> The temporary add-on is removed when Firefox restarts. For a persistent install without signing, use one of the following Firefox variants that allow disabling signature enforcement:
>
> - **Firefox Developer Edition** — [download](https://www.mozilla.org/firefox/developer/)
> - **Firefox Nightly** — [download](https://www.mozilla.org/firefox/nightly/)
>
> In either variant:
> 1. Go to `about:config` → accept the risk warning
> 2. Search for `xpinstall.signatures.required` → set it to `false`
> 3. Go to `about:addons` → gear icon → **Install Add-on From File** → select the `.zip`
>
> Standard Firefox releases (including ESR) do not support disabling signature checks and cannot permanently install unsigned extensions.

---

## How it works

1. **Save** — Go to [translate.google.com](https://translate.google.com), type a word. A **Save** button appears next to the main translation and each alternative. Click it.
2. **Normalize** — Open the Dashboard → Words tab. Click **⚡ Normalize all raw** to auto-convert words to their canonical learning form (`playing` → `to play`, `awesome` → `(adj) awesome`, etc.).
3. **Review** — Edit canonical forms inline, set POS tags, find and resolve duplicates.
4. **Export** — Go to the Export tab, select a group, download a `.txt` file, and import it into Quizlet.

---

## Installing

### Development (unpacked)

#### Chrome / Chromium / Edge

```bash
./build.sh chrome
```

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select `dist/chrome/`

#### Firefox

```bash
./build.sh firefox
```

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…** → select `dist/firefox/manifest.json`

The extension loads for the current session. Repeat after Firefox restart.

### Production (packed)

#### Chrome — `.zip`

```bash
./build.sh chrome
cd dist/chrome && zip -r ../../vocabular-chrome.zip .
```

Upload `vocabular-chrome.zip` to the Chrome Web Store developer dashboard.

#### Firefox — `.xpi`

```bash
./build.sh firefox
cd dist/firefox && zip -r ../../vocabular-firefox.xpi .
```

Load via `about:addons` → gear icon → **Install Add-on From File**, or submit to AMO for signing.

---

## Build system

The JS codebase is identical for both browsers. Only the manifest differs:

| File | Used for | Background key |
|---|---|---|
| `manifest.chrome.json` | Chrome build | `service_worker` |
| `manifest.firefox.json` | Firefox build | `scripts` array |

`build.sh` copies the correct manifest as `manifest.json` into `dist/<browser>/`.

The `manifest.json` at the repo root is the current working hybrid used for quick local development in Firefox via `about:debugging`.

---

## Usage guide

### Saving a word

1. Go to [translate.google.com](https://translate.google.com)
2. Type a word or phrase (EN → UA or any target language)
3. Click **Save** next to the translation you want
4. The button briefly shows **Saved ✓** — word is stored locally

The POS tag (noun, verb, adjective, adverb) is read directly from the Google Translate UI label and stored with the word, so normalization works correctly without guessing.

If you see **Already saved**, this exact word + translation pair is already in your list.

### Dashboard

Click the 📖 icon in your toolbar, then **Open Dashboard**.

#### Words tab

| Action | How |
|---|---|
| Edit canonical form | Click the cell in the Canonical column |
| Change POS | Click the POS badge |
| Normalize one word | Click ⚡ on the row |
| Normalize all raw words | **⚡ Normalize all raw** button |
| Find duplicates | **🔍 Find duplicates** — highlights matches, offers Keep / Merge / Skip |
| Select rows | Checkbox on each row; header checkbox selects all visible |
| Delete selected | **🗑 Delete selected (N)** — appears when rows are checked |
| Delete all visible | **🗑 Delete all** — respects active filters |
| Delete one word | 🗑 button on the row |
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

When a POS tag was captured at save time (from the Google Translate UI), the normalizer uses it directly. For words saved without a POS tag, compromise.js NLP detects it automatically.

| Input | Canonical form | POS |
|---|---|---|
| `playing`, `played`, `plays` | `to play` | verb |
| `awesome`, `beautiful` | `(adj) awesome` | adj |
| `awfully`, `quickly` | `(adv) awfully` | adv |
| `dog`, `happiness` | `a dog` | noun |
| `can't help telling` | `can't help Ving` | phrase |
| `can't stand it` | `can't stand sth` | phrase |

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

1. Open `content/reverso.js` — it contains step-by-step instructions
2. Add a new entry to both `manifest.chrome.json` and `manifest.firefox.json` under `content_scripts`:
```json
{
  "matches": ["https://context.reverso.net/*"],
  "js": ["lib/browser-polyfill.js", "content/reverso.js"],
  "css": ["content/content.css"],
  "run_at": "document_idle"
}
```
3. Add `"https://context.reverso.net/*"` to `host_permissions` in both manifests
4. No changes needed to any other file

---

## Adding an AI normalizer (future)

1. Set your OpenAI API key in Settings
2. In `lib/normalizer.js`, implement the `OpenAINormalizer` class (stub is already there with instructions)
3. Change `normalizerEngine` to `'openai'` in Settings

---

## Data storage

All data lives in `chrome.storage.local` (or `browser.storage.local` on Firefox — same API) — your browser profile, never sent anywhere.

Keys used:
- `voc_words` — all saved words
- `voc_groups` — word groups
- `voc_settings` — settings

Storage limit: ~10MB (enough for tens of thousands of words). Use **Export backup** regularly.

---

## Project structure

```
vocabular/
├── manifest.json              Working manifest (Firefox-compatible hybrid for dev)
├── manifest.chrome.json       Chrome production manifest (service_worker)
├── manifest.firefox.json      Firefox production manifest (scripts array)
├── build.sh                   Build script: ./build.sh chrome|firefox
├── background.js              Service worker / background scripts — message bus
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
│       ├── words.js           Words tab (with bulk delete)
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
│   └── browser-polyfill.js    Chrome/Firefox API compatibility (bundled)
└── icons/
```
