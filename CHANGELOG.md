# Changelog

All notable changes to Vocabular are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

The release pipeline (`.github/workflows/release.yml`) publishes the section
whose heading matches the released version, e.g. `## [0.0.2]`, as the release
notes. Keep every version heading in the form `## [x.y.z]` (optionally followed
by ` - date`). Add the next version's section at the top before tagging.

## [0.0.2]

### Added
- Normalizer now picks `a` / `an` by the first sound of a noun (`an apple`, `an hour`, `a university`).
- Uncountable nouns are detected and shown as `(unc) <word>` (`(unc) water`, `(unc) furniture`).
- Every column in the dashboard Words table is editable inline: word, translation, canonical, POS, status, saved date and notes.
- `CHANGELOG.md`; release notes are now taken from it by the release pipeline.
- `.gitignore`.
- Changing the group size in Settings now regroups existing words (oldest first). Exported groups are left untouched; manual drag-and-drop placement in other groups is reset (a confirmation is shown first).

### Changed
- Editable cells fill the whole table cell, so empty values are easy to click.
- `build.sh` no longer copies `.github/`, `.idea/` or `.gitignore` into the package.
- Kiro spec (`.kiro/`) and README updated to match the code; task checkboxes synced.

### Fixed
- Drag-and-drop of words between groups did nothing: the drop targets used inline `ondrop`/`ondragover` attributes, which the extension CSP blocks. Handlers are now attached with `addEventListener`, and the target group is highlighted while dragging.
- The Save button on Google Translate alternatives disappeared when an option was expanded. Google re-renders the row and wipes the button, but the "already injected" marker on the row survived, so it was never re-added. Buttons are now re-created whenever missing or out of date, and the page observer watches `document.body` instead of a single row.
- The "Skip" button in the duplicates panel had the same inline-handler problem.

### Removed
- Generated `dist/` build output is no longer tracked in git.

## [0.0.1]

### Added
- Save translations from Google Translate (main result and alternatives) with a Save button.
- Local normalization with compromise.js: verbs → `to <inf>`, `(adj)`, `(adv)`, nouns, phrases (`Ving`, `sth`).
- Translation-based POS tiebreaker for words that are both verb and noun.
- Duplicate detection (exact and Levenshtein ≤ 2) with keep/merge actions.
- Dashboard: Words, Groups (auto-partition, rename, drag-and-drop), Export and Settings tabs.
- Quizlet export as `.txt` or clipboard, with configurable separators.
- JSON backup and restore.
- Bulk delete, delete selected and delete all.
- Firefox support alongside Chrome / Chromium / Edge (per-browser manifests, `build.sh`).
- GitHub Actions release workflow building Chrome and Firefox zips.
