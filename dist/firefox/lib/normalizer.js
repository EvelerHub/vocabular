// lib/normalizer.js — Normalizer Interface + Implementations
//
// INormalizer defines the contract for all normalization engines.
// LocalNormalizer implements it using compromise.js (offline NLP).
// OpenAINormalizer is a stub for future AI-based normalization.
//
// Usage:
//   const normalizer = getNormalizer(settings);
//   const { canonical, pos } = await normalizer.normalize('playing');
//   // → { canonical: 'to play', pos: 'verb' }
//
// The result is always a SUGGESTION — the user confirms or overrides in the dashboard.

// ── Base class / Interface ─────────────────────────────────────────────────────

class INormalizer {
  /**
   * Normalizes a raw English word or phrase into its canonical learning form.
   *
   * @param {string} word        — raw input, e.g. "playing", "awesome", "can't help telling"
   * @param {string} [pos]       — optional hint: 'verb'|'adj'|'adv'|'noun'|'phrase'|''
   * @param {string} [translation] — optional translation (e.g. Ukrainian), used as a POS
   *                                 tiebreaker when the English word is morphologically ambiguous
   * @returns {Promise<{ canonical: string, pos: string }>}
   *   canonical — suggested canonical form, e.g. "to play", "(adj) awesome"
   *   pos       — detected or confirmed POS tag
   */
  // eslint-disable-next-line no-unused-vars
  async normalize(word, pos = '', translation = '') {
    throw new Error('INormalizer.normalize() must be implemented by a subclass');
  }
}

// ── LocalNormalizer ────────────────────────────────────────────────────────────

/**
 * Implements INormalizer using compromise.js (bundled offline NLP library).
 * compromise.js must be loaded before this script (via <script> or importScripts).
 */
class LocalNormalizer extends INormalizer {

  /**
   * Object pronouns that are replaced with 'sth' in phrases.
   * @type {Set<string>}
   */
  static OBJ_PRONOUNS = new Set([
    'it', 'him', 'her', 'them', 'something', 'someone',
    'anything', 'everything', 'sb', 'sth',
  ]);

  /**
   * @param {Function} nlpFn — the compromise `nlp` function (default: global `nlp`)
   */
  constructor(nlpFn) {
    super();
    // In the extension context, compromise.js is loaded as a script tag / importScripts
    // and exposes itself as a global. Allow injection for testing.
    this._nlp = nlpFn || (typeof nlp !== 'undefined' ? nlp : null);
  }

  async normalize(word, pos = '', translation = '') {
    const input = (word || '').trim();
    if (!input) return { canonical: '', pos: '' };

    // If the user already provided a POS hint, use a targeted pipeline
    if (pos) {
      return this._normalizeWithHint(input, pos);
    }

    const words = input.split(/\s+/);
    const isPhrase = words.length > 1;

    // ── Phrase handling ──────────────────────────────────────────────────────
    if (isPhrase) {
      return this._normalizePhrase(input, words);
    }

    // ── Single-word NLP detection ────────────────────────────────────────────
    return this._normalizeSingleWord(input, (translation || '').trim());
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Normalizes a single word using compromise POS detection.
   *
   * When the word is ambiguous — i.e. compromise tags it as a verb but it also
   * qualifies as a noun (e.g. "bank", "bear", "fly") — the translation is used
   * as a tiebreaker via `_inferPosFromTranslation()`.
   *
   * Explicit priority when NOT ambiguous: verb → adverb → adjective → noun → fallback
   * (adverb before adjective because many -ly words are both)
   *
   * @param {string} word
   * @param {string} [translation] — translated form, used as POS tiebreaker
   * @returns {{ canonical: string, pos: string }}
   */
  _normalizeSingleWord(word, translation = '') {
    if (!this._nlp) {
      // compromise not loaded — return as-is
      return { canonical: word, pos: '' };
    }

    const doc = this._nlp(word);

    const isVerb = doc.verbs().length > 0;
    const isNoun = doc.nouns().length > 0;
    const isAdv  = doc.adverbs().length > 0;
    const isAdj  = doc.adjectives().length > 0;

    // ── Ambiguity resolution ─────────────────────────────────────────────────
    // Many common English words are both verbs and nouns (bank, bear, fly, hit,
    // run, etc.). When compromise tags a word as a verb but it is also a noun,
    // use the translation as a tiebreaker before blindly applying verb rules.
    if (isVerb && isNoun && translation) {
      const hinted = this._inferPosFromTranslation(translation);
      if (hinted === 'noun') {
        const singular = doc.nouns().toSingular().out('text') || word;
        return { canonical: `a ${singular}`, pos: 'noun' };
      }
      if (hinted === 'adj') {
        return { canonical: `(adj) ${word}`, pos: 'adj' };
      }
      if (hinted === 'adv') {
        return { canonical: `(adv) ${word}`, pos: 'adv' };
      }
      // hinted === 'verb' or null → fall through to normal priority order below
    }

    // ── Normal priority order ────────────────────────────────────────────────

    // Verb check
    if (isVerb) {
      const base = doc.verbs().toInfinitive().out('text') || word;
      return { canonical: `to ${base}`, pos: 'verb' };
    }

    // Adverb check (before adjective — -ly words get misclassified as adj sometimes)
    if (isAdv) {
      return { canonical: `(adv) ${word}`, pos: 'adv' };
    }

    // Adjective check
    if (isAdj) {
      return { canonical: `(adj) ${word}`, pos: 'adj' };
    }

    // Noun check
    if (isNoun) {
      // Suggest "a <noun>" — user can override to "<noun> (unc)" for uncountable
      const singular = doc.nouns().toSingular().out('text') || word;
      return { canonical: `a ${singular}`, pos: 'noun' };
    }

    // Fallback: return as-is, no POS detected
    return { canonical: word, pos: '' };
  }

  /**
   * Infers the likely POS of the *English* source word by inspecting morphological
   * patterns in the translation (Ukrainian / Russian).
   *
   * This is a heuristic, not a full morphological parser. It covers the most
   * common endings well enough to break verb-vs-noun ambiguity for typical
   * vocabulary words.
   *
   * Returns: 'noun' | 'verb' | 'adj' | 'adv' | null
   *   null means the translation gives no useful signal.
   *
   * @param {string} translation
   * @returns {string|null}
   */
  _inferPosFromTranslation(translation) {
    if (!translation) return null;

    const t = translation.trim().toLowerCase();

    // ── Multi-word: likely a phrase — no POS hint ────────────────────────────
    if (/\s/.test(t)) return null;

    // ── Adverb endings (uk/ru) ───────────────────────────────────────────────
    // -но, -ньо, -ко, -ше, -же  (e.g. швидко, добре, краще)
    if (/но$|ньо$|ко$|ше$|же$/.test(t)) return 'adv';

    // ── Adjective endings (uk/ru) ────────────────────────────────────────────
    // -ий, -ій, -ій, -ый, -ой, -ій, -а (short adj), -е (neuter short)
    // nominative long form: -ний/-ній/-дній/-зній + gender
    if (/ний$|ній$|дній$|зній$|ський$|зький$|цький$/.test(t)) return 'adj';
    if (/[ьь]?(ий|ій|ый|ой)$/.test(t)) return 'adj';
    // Participial / adjectival forms ending in -ний are already above

    // ── Verb endings (uk/ru infinitive) ─────────────────────────────────────
    // Ukrainian: -ти, -ться, -ти, -тись
    // Russian:   -ть, -ться, -чь
    if (/ти$|тись$|тися$|ть$|ться$|чь$/.test(t)) return 'verb';

    // ── Noun endings (uk/ru) — broad but reliable ────────────────────────────
    // Masculine: ending in consonant, -ь, -й
    // Feminine:  -а, -я, -ість, -ість, -ість
    // Neuter:    -о, -е, -я, -ення, -ання
    // The key insight: if it's NOT a verb/adj/adv and ends in a typical noun
    // pattern, call it a noun.
    if (/ість$|ість$|ення$|ання$|ство$|ство$/.test(t)) return 'noun';
    if (/[аяоеє]$/.test(t)) return 'noun';   // neuter / feminine
    if (/ь$/.test(t)) return 'noun';           // soft-sign masculine/feminine noun
    if (/й$/.test(t)) return null;             // could be adj short form — no signal

    // Ends in a hard consonant → likely masculine noun (банк, ліс, стіл…)
    if (/[бвгґджзклмнпрстфхцчшщ]$/i.test(t)) return 'noun';

    return null;
  }

  /**
   * Normalizes a multi-word phrase by applying pattern-based rules.
   *
   * Rules (in order):
   *   1. Last word ends in -ing → replace with Ving  ("can't help telling" → "can't help Ving")
   *   2. Last word is an object pronoun → replace with sth  ("can't stand it" → "can't stand sth")
   *   3. Otherwise return as-is with pos='phrase'
   *
   * @param {string} phrase
   * @param {string[]} words  — pre-split array
   * @returns {{ canonical: string, pos: string }}
   */
  _normalizePhrase(phrase, words) {
    const lastWord = words[words.length - 1];
    const lastLower = lastWord.toLowerCase().replace(/[.,!?;:]$/, '');

    if (lastWord.endsWith('ing')) {
      const canonical = [...words.slice(0, -1), 'Ving'].join(' ');
      return { canonical, pos: 'phrase' };
    }

    if (LocalNormalizer.OBJ_PRONOUNS.has(lastLower)) {
      const canonical = [...words.slice(0, -1), 'sth'].join(' ');
      return { canonical, pos: 'phrase' };
    }

    return { canonical: phrase, pos: 'phrase' };
  }

  /**
   * Normalizes using an explicit POS hint (bypasses auto-detection).
   * Used when the user sets POS manually in the dashboard and re-normalizes.
   *
   * @param {string} word
   * @param {string} pos
   * @returns {{ canonical: string, pos: string }}
   */
  _normalizeWithHint(word, pos) {
    switch (pos) {
      case 'verb': {
        let base = word;
        if (this._nlp) {
          const inf = this._nlp(word).verbs().toInfinitive().out('text');
          if (inf) base = inf;
        }
        return { canonical: `to ${base}`, pos: 'verb' };
      }
      case 'adj':
        return { canonical: `(adj) ${word}`, pos: 'adj' };
      case 'adv':
        return { canonical: `(adv) ${word}`, pos: 'adv' };
      case 'noun': {
        let singular = word;
        if (this._nlp) {
          const s = this._nlp(word).nouns().toSingular().out('text');
          if (s) singular = s;
        }
        return { canonical: `a ${singular}`, pos: 'noun' };
      }
      case 'phrase': {
        const words = word.split(/\s+/);
        return this._normalizePhrase(word, words);
      }
      default:
        return { canonical: word, pos };
    }
  }
}

// ── OpenAINormalizer stub ──────────────────────────────────────────────────────

/**
 * Future: AI-based normalization using OpenAI API.
 * Swap in by setting settings.normalizerEngine = 'openai' and providing an API key.
 *
 * To implement:
 *   1. Call POST https://api.openai.com/v1/chat/completions
 *   2. System prompt: "You normalize English vocabulary words into their canonical
 *      learning form. Return JSON: { canonical: string, pos: string }.
 *      POS values: verb → 'to <infinitive>', adj → '(adj) <word>',
 *      adv → '(adv) <word>', noun → 'a <singular-noun>',
 *      phrase (ends in -ing) → replace last gerund with Ving,
 *      phrase (ends in object pronoun) → replace with sth."
 *   3. User message: the raw word/phrase
 *   4. Parse the JSON response
 *   5. Handle rate limit / error → fall back to LocalNormalizer
 */
class OpenAINormalizer extends INormalizer {
  constructor(apiKey) {
    super();
    this._apiKey = apiKey;
    this._fallback = new LocalNormalizer();
  }

  async normalize(word, pos = '', translation = '') {
    if (!this._apiKey) {
      console.warn('[Vocabular] OpenAI API key not set, falling back to LocalNormalizer');
      return this._fallback.normalize(word, pos, translation);
    }
    // TODO: implement OpenAI API call
    throw new Error('OpenAINormalizer not yet implemented');
  }
}

// ── Factory ────────────────────────────────────────────────────────────────────

/**
 * Returns the correct normalizer implementation based on settings.
 *
 * @param {{ normalizerEngine: string, openaiApiKey: string }} settings
 * @param {Function} [nlpFn] — optional compromise function override (for testing)
 * @returns {INormalizer}
 */
function getNormalizer(settings, nlpFn) {
  const engine = (settings && settings.normalizerEngine) || 'local';
  switch (engine) {
    case 'openai':
      return new OpenAINormalizer(settings.openaiApiKey || '');
    case 'local':
    default:
      return new LocalNormalizer(nlpFn);
  }
}
