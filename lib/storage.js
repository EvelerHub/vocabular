// lib/storage.js — Storage Service
//
// Single access point for all extension data stored in chrome.storage.local.
// No other module should call chrome.storage directly.
//
// Storage keys (prefixed to avoid collisions):
//   voc_words    → Word[]
//   voc_groups   → Group[]
//   voc_settings → Settings
//
// ─── Type Definitions ────────────────────────────────────────────────────────
//
// @typedef {Object} Word
// @property {string}      id          — UUID
// @property {string}      word        — raw source text as typed/saved
// @property {string}      translation — raw translation as saved
// @property {string}      langFrom    — source language code, e.g. "en"
// @property {string}      langTo      — target language code, e.g. "uk"
// @property {string}      canonical   — normalized form (empty until normalized)
// @property {string}      pos         — 'verb'|'adj'|'adv'|'noun'|'phrase'|''
// @property {string}      status      — 'raw'|'normalized'|'grouped'|'exported'
// @property {string|null} groupId     — foreign key to Group.id
// @property {string}      savedAt     — ISO 8601 datetime string
// @property {string}      notes       — free-form user notes
//
// @typedef {Object} Group
// @property {string}      id          — UUID
// @property {string}      name        — display name, e.g. "Set 1"
// @property {string}      createdAt   — ISO 8601 datetime
// @property {string|null} exportedAt  — ISO 8601 datetime or null
//
// @typedef {Object} Settings
// @property {number} groupSize          — words per Quizlet set (default 50)
// @property {string} exportTermSep      — separator between term and definition (default '\t')
// @property {string} exportRowSep       — separator between rows (default '\n')
// @property {string} normalizerEngine   — 'local' | 'openai'
// @property {string} dedupeEngine       — 'local' | 'openai'
// @property {string} openaiApiKey       — stored locally, used only when engine = 'openai'
//
// ─────────────────────────────────────────────────────────────────────────────

const KEYS = {
  WORDS:    'voc_words',
  GROUPS:   'voc_groups',
  SETTINGS: 'voc_settings',
};

/** Default settings — merged with stored values on every getSettings() call */
const DEFAULT_SETTINGS = {
  groupSize:        50,
  exportTermSep:    '\t',
  exportRowSep:     '\n',
  normalizerEngine: 'local',
  dedupeEngine:     'local',
  openaiApiKey:     '',
};

// ─── Low-level chrome.storage helpers ────────────────────────────────────────

/**
 * Reads one or more keys from chrome.storage.local.
 * @param {string|string[]} keys
 * @returns {Promise<Object>}
 */
function chromeGet(keys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keys, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Writes an object of key→value pairs to chrome.storage.local.
 * @param {Object} items
 * @returns {Promise<void>}
 */
function chromeSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

// ─── Storage Service ──────────────────────────────────────────────────────────

const storage = {

  // ── Words ──────────────────────────────────────────────────────────────────

  /**
   * Returns all saved words, ordered by savedAt ascending (oldest first).
   * @returns {Promise<Word[]>}
   */
  async getWords() {
    const result = await chromeGet(KEYS.WORDS);
    const words = result[KEYS.WORDS] || [];
    return words.slice().sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  },

  /**
   * Saves a new word entry. Generates id and savedAt automatically.
   * @param {{ word: string, translation: string, langFrom: string, langTo: string }} payload
   * @returns {Promise<Word>}
   */
  async saveWord(payload) {
    const result = await chromeGet(KEYS.WORDS);
    const words = result[KEYS.WORDS] || [];

    /** @type {Word} */
    const newWord = {
      id:          generateUUID(),
      word:        (payload.word || '').trim(),
      translation: (payload.translation || '').trim(),
      langFrom:    payload.langFrom || 'en',
      langTo:      payload.langTo   || 'ua',
      canonical:   '',
      pos:         payload.pos      || '',
      status:      'raw',
      groupId:     null,
      savedAt:     new Date().toISOString(),
      notes:       '',
    };

    words.push(newWord);
    await chromeSet({ [KEYS.WORDS]: words });
    return newWord;
  },

  /**
   * Applies a partial update to a word by id.
   * @param {string} id
   * @param {Partial<Word>} patch
   * @returns {Promise<Word>}
   */
  async updateWord(id, patch) {
    const result = await chromeGet(KEYS.WORDS);
    const words = result[KEYS.WORDS] || [];
    const idx = words.findIndex(w => w.id === id);
    if (idx === -1) throw new Error(`Word not found: ${id}`);

    // Prevent accidental id/savedAt overwrite
    const { id: _id, savedAt: _savedAt, ...safePatch } = patch;
    words[idx] = { ...words[idx], ...safePatch };
    await chromeSet({ [KEYS.WORDS]: words });
    return words[idx];
  },

  /**
   * Deletes a word by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteWord(id) {
    const result = await chromeGet(KEYS.WORDS);
    const words = (result[KEYS.WORDS] || []).filter(w => w.id !== id);
    await chromeSet({ [KEYS.WORDS]: words });
  },

  /**
   * Returns true if an entry with the same (word, translation, langFrom, langTo)
   * already exists. One English word can have many valid translations, so
   * translation is part of the uniqueness key.
   * @param {string} word
   * @param {string} translation
   * @param {string} langFrom
   * @param {string} langTo
   * @returns {Promise<boolean>}
   */
  async isDuplicate(word, translation, langFrom, langTo) {
    const result = await chromeGet(KEYS.WORDS);
    const words = result[KEYS.WORDS] || [];
    const needleWord  = word.trim().toLowerCase();
    const needleTrans = translation.trim().toLowerCase();
    return words.some(
      w => w.word.toLowerCase()        === needleWord  &&
           w.translation.toLowerCase() === needleTrans &&
           w.langFrom === langFrom &&
           w.langTo   === langTo
    );
  },

  // ── Groups ─────────────────────────────────────────────────────────────────

  /**
   * Returns all groups, ordered by createdAt ascending.
   * @returns {Promise<Group[]>}
   */
  async getGroups() {
    const result = await chromeGet(KEYS.GROUPS);
    const groups = result[KEYS.GROUPS] || [];
    return groups.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },

  /**
   * Creates and persists a new group.
   * @param {{ name: string }} payload
   * @returns {Promise<Group>}
   */
  async saveGroup(payload) {
    const result = await chromeGet(KEYS.GROUPS);
    const groups = result[KEYS.GROUPS] || [];

    /** @type {Group} */
    const newGroup = {
      id:         generateUUID(),
      name:       payload.name || 'Set',
      createdAt:  new Date().toISOString(),
      exportedAt: null,
    };

    groups.push(newGroup);
    await chromeSet({ [KEYS.GROUPS]: groups });
    return newGroup;
  },

  /**
   * Applies a partial update to a group by id.
   * @param {string} id
   * @param {Partial<Group>} patch
   * @returns {Promise<Group>}
   */
  async updateGroup(id, patch) {
    const result = await chromeGet(KEYS.GROUPS);
    const groups = result[KEYS.GROUPS] || [];
    const idx = groups.findIndex(g => g.id === id);
    if (idx === -1) throw new Error(`Group not found: ${id}`);

    const { id: _id, createdAt: _ca, ...safePatch } = patch;
    groups[idx] = { ...groups[idx], ...safePatch };
    await chromeSet({ [KEYS.GROUPS]: groups });
    return groups[idx];
  },

  /**
   * Deletes a group by id. Does NOT delete its words — they become ungrouped.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async deleteGroup(id) {
    // Unassign words that belonged to this group
    const wordsResult = await chromeGet(KEYS.WORDS);
    const words = wordsResult[KEYS.WORDS] || [];
    const updatedWords = words.map(w =>
      w.groupId === id ? { ...w, groupId: null, status: w.status === 'grouped' ? 'normalized' : w.status } : w
    );

    const groupsResult = await chromeGet(KEYS.GROUPS);
    const groups = (groupsResult[KEYS.GROUPS] || []).filter(g => g.id !== id);

    await chromeSet({ [KEYS.WORDS]: updatedWords, [KEYS.GROUPS]: groups });
  },

  // ── Settings ───────────────────────────────────────────────────────────────

  /**
   * Returns settings merged with defaults. Missing keys are always filled in.
   * @returns {Promise<Settings>}
   */
  async getSettings() {
    const result = await chromeGet(KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[KEYS.SETTINGS] || {}) };
  },

  /**
   * Merges a patch into stored settings and persists.
   * @param {Partial<Settings>} patch
   * @returns {Promise<Settings>}
   */
  async saveSettings(patch) {
    const current = await this.getSettings();
    const updated = { ...current, ...patch };
    await chromeSet({ [KEYS.SETTINGS]: updated });
    return updated;
  },

  // ── Backup / Restore ───────────────────────────────────────────────────────

  /**
   * Exports the complete storage as a plain object (for JSON backup).
   * @returns {Promise<{ words: Word[], groups: Group[], settings: Settings }>}
   */
  async exportAll() {
    const [words, groups, settings] = await Promise.all([
      this.getWords(),
      this.getGroups(),
      this.getSettings(),
    ]);
    return {
      version:   '1',
      exportedAt: new Date().toISOString(),
      words,
      groups,
      settings,
    };
  },

  /**
   * Restores from a previously exported JSON backup.
   * Completely replaces current data.
   * @param {{ words: Word[], groups: Group[], settings: Settings }} data
   * @returns {Promise<void>}
   */
  async importAll(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid backup data');
    }
    const words    = Array.isArray(data.words)    ? data.words    : [];
    const groups   = Array.isArray(data.groups)   ? data.groups   : [];
    const settings = (data.settings && typeof data.settings === 'object')
      ? { ...DEFAULT_SETTINGS, ...data.settings }
      : DEFAULT_SETTINGS;

    await chromeSet({
      [KEYS.WORDS]:    words,
      [KEYS.GROUPS]:   groups,
      [KEYS.SETTINGS]: settings,
    });
  },

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Returns aggregate stats used by the popup.
   * @returns {Promise<{ total: number, pendingNormalization: number }>}
   */
  async getStats() {
    const words = await this.getWords();
    return {
      total:                words.length,
      pendingNormalization: words.filter(w => w.status === 'raw').length,
    };
  },

  /**
   * Returns the N most recently saved words.
   * @param {number} [n=5]
   * @returns {Promise<Word[]>}
   */
  async getRecentWords(n = 5) {
    const words = await this.getWords();
    // getWords() returns oldest-first, so reverse for "most recent"
    return words.slice().reverse().slice(0, n);
  },
};
