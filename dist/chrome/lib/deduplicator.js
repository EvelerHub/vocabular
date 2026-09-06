// lib/deduplicator.js — Duplicate Detector Interface + Implementations
//
// IDuplicateDetector defines the contract.
// LocalDeduplicator implements it using:
//   Pass 1 — exact match on canonical (case-insensitive, trimmed)
//   Pass 2 — Levenshtein distance ≤ 2 on canonical, same POS
// OpenAIDeduplicator is a stub for future semantic similarity detection.
//
// Usage:
//   const deduplicator = getDeduplicator(settings);
//   const groups = await deduplicator.findDuplicates(words);
//   // → [{ words: [Word, Word], reason: 'exact match' }, ...]
//
// Each returned group has 2+ words. Resolution (merge/keep/delete) is done
// manually by the user in the dashboard.

// ── Base class / Interface ─────────────────────────────────────────────────────

class IDuplicateDetector {
  /**
   * Scans a list of words and returns groups of likely duplicates.
   *
   * @param {Word[]} words — full list from storage
   * @returns {Promise<DuplicateGroup[]>}
   *
   * @typedef {{ words: Word[], reason: string }} DuplicateGroup
   */
  // eslint-disable-next-line no-unused-vars
  async findDuplicates(words) {
    throw new Error('IDuplicateDetector.findDuplicates() must be implemented by a subclass');
  }
}

// ── Levenshtein distance ───────────────────────────────────────────────────────

/**
 * Computes the Levenshtein edit distance between two strings.
 * Pure JS, no dependencies. O(m*n) time, O(min(m,n)) space.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Keep the shorter string in `b` to minimise memory
  if (a.length < b.length) { const t = a; a = b; b = t; }

  const bLen = b.length;
  let prev = Array.from({ length: bLen + 1 }, (_, i) => i);
  let curr = new Array(bLen + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,          // insertion
        prev[j] + 1,               // deletion
        prev[j - 1] + cost         // substitution
      );
    }
    // Swap rows
    const tmp = prev; prev = curr; curr = tmp;
  }

  return prev[bLen];
}

// ── LocalDeduplicator ──────────────────────────────────────────────────────────

class LocalDeduplicator extends IDuplicateDetector {

  /**
   * Maximum Levenshtein distance to consider two words near-duplicates.
   * @type {number}
   */
  static MAX_DISTANCE = 2;

  async findDuplicates(words) {
    if (!Array.isArray(words) || words.length < 2) return [];

    const groups = [];
    const grouped = new Set(); // ids already assigned to a group

    // ── Pass 1: exact canonical match (case-insensitive) ─────────────────────
    const byCanonical = new Map();

    for (const word of words) {
      const key = this._canonicalKey(word);
      if (!key) continue; // skip words with no canonical yet — use raw word instead
      if (!byCanonical.has(key)) byCanonical.set(key, []);
      byCanonical.get(key).push(word);
    }

    for (const [, group] of byCanonical) {
      if (group.length >= 2) {
        groups.push({ words: group, reason: 'exact match' });
        group.forEach(w => grouped.add(w.id));
      }
    }

    // ── Pass 2: near-duplicate via Levenshtein ────────────────────────────────
    // Only check words not already in an exact-match group.
    const remaining = words.filter(w => !grouped.has(w.id));

    for (let i = 0; i < remaining.length; i++) {
      if (grouped.has(remaining[i].id)) continue;
      const cluster = [remaining[i]];

      for (let j = i + 1; j < remaining.length; j++) {
        if (grouped.has(remaining[j].id)) continue;

        const a = remaining[i];
        const b = remaining[j];

        // Same POS is required to reduce false positives
        // (empty POS on both sides is also considered "same")
        const samePOS = (a.pos === b.pos) || (!a.pos && !b.pos);
        if (!samePOS) continue;

        const keyA = this._canonicalKey(a);
        const keyB = this._canonicalKey(b);
        if (!keyA || !keyB) continue;

        const dist = levenshtein(keyA, keyB);
        if (dist <= LocalDeduplicator.MAX_DISTANCE) {
          cluster.push(b);
          grouped.add(b.id);
        }
      }

      if (cluster.length >= 2) {
        grouped.add(remaining[i].id);
        groups.push({ words: cluster, reason: `similar spelling (edit distance ≤ ${LocalDeduplicator.MAX_DISTANCE})` });
      }
    }

    return groups;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Returns the normalised key used for comparison:
   * canonical if set, otherwise raw word. Always lowercase + trimmed.
   *
   * @param {Word} word
   * @returns {string}
   */
  _canonicalKey(word) {
    const text = (word.canonical || word.word || '').trim().toLowerCase();
    return text;
  }
}

// ── OpenAIDeduplicator stub ────────────────────────────────────────────────────

/**
 * Future: semantic duplicate detection using OpenAI embeddings.
 * Words with high cosine similarity of their embeddings are flagged as duplicates
 * even when they look nothing alike textually (e.g. "to bear sth" vs "bearing that fate").
 *
 * To implement:
 *   1. Batch-call POST https://api.openai.com/v1/embeddings for all canonical values.
 *   2. Compute pairwise cosine similarity.
 *   3. Flag pairs with similarity ≥ threshold (e.g. 0.92) as duplicates.
 *   4. Group transitively connected pairs.
 *   5. Return groups with reason: 'semantically similar (AI)'.
 *   6. On API error, fall back to LocalDeduplicator.
 */
class OpenAIDeduplicator extends IDuplicateDetector {
  constructor(apiKey) {
    super();
    this._apiKey = apiKey;
    this._fallback = new LocalDeduplicator();
  }

  async findDuplicates(words) {
    if (!this._apiKey) {
      console.warn('[Vocabular] OpenAI API key not set, falling back to LocalDeduplicator');
      return this._fallback.findDuplicates(words);
    }
    // TODO: implement OpenAI embeddings-based deduplication
    throw new Error('OpenAIDeduplicator not yet implemented');
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Returns the correct deduplicator implementation based on settings.
 *
 * @param {{ dedupeEngine: string, openaiApiKey: string }} settings
 * @returns {IDuplicateDetector}
 */
function getDeduplicator(settings) {
  const engine = (settings && settings.dedupeEngine) || 'local';
  switch (engine) {
    case 'openai':
      return new OpenAIDeduplicator(settings.openaiApiKey || '');
    case 'local':
    default:
      return new LocalDeduplicator();
  }
}
