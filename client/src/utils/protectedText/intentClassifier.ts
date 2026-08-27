/**
 * Local intent classifier — Protected Text v2.
 *
 * Classifies a plaintext message into one coarse category, entirely on-device, using simple
 * deterministic keyword/regex heuristics. This exists only to drive PATTERN mode's abstract
 * glyph selection — the classification result is never persisted or transmitted anywhere.
 *
 * Privacy > accuracy: false positives are acceptable (spec §12/§13). Categories are
 * deliberately coarse (e.g. "TIME", not "8pm meeting") so PATTERN mode cannot leak specifics.
 */

export type IntentCategory =
  | 'URGENT'
  | 'QUESTION'
  | 'TIME'
  | 'LOCATION'
  | 'REQUEST'
  | 'NEGATION'
  | 'AFFIRMATION'
  | 'GREETING'
  | 'FAREWELL'
  | 'ACKNOWLEDGEMENT'
  | 'GENERAL';

const URGENT_KEYWORDS = ['urgent', 'emergency', 'asap', 'right now', 'immediately', 'help me'];
const INTERROGATIVE_STARTERS = [
  'who', 'what', 'when', 'where', 'why', 'how',
  'can', 'could', 'would', 'should', 'is', 'are', 'do', 'does', 'did', 'will',
];
const TIME_KEYWORDS = [
  'today', 'tomorrow', 'tonight', 'yesterday', 'morning', 'afternoon', 'evening', 'noon', 'midnight',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
];
const TIME_PATTERN = /\b\d{1,2}(:\d{2})?\s?(am|pm)\b/i;
const LOCATION_KEYWORDS = [
  'station', 'airport', 'address', 'location', 'near', 'building',
  'office', 'home', 'street', 'road', 'avenue', 'mall', 'park', 'restaurant', 'meet me at',
];
const REQUEST_KEYWORDS = ['please', 'can you', 'could you', 'would you', 'send me', 'give me', 'help me with'];
const NEGATION_KEYWORDS = ["don't", "doesn't", 'not', 'never', 'no', 'nope', "can't", "won't"];
const AFFIRMATION_KEYWORDS = ['yes', 'yeah', 'yep', 'sure', 'affirmative', 'agreed', 'absolutely'];
const GREETING_KEYWORDS = ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'yo', 'hola'];
const FAREWELL_KEYWORDS = ['bye', 'goodbye', 'see you', 'take care', 'farewell', 'later'];
const ACKNOWLEDGEMENT_KEYWORDS = ['got it', 'noted', 'understood', 'roger', 'thanks', 'thank you', 'ack', 'ok', 'okay'];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word/phrase matching (not naive substring containment) so short keywords like "no" or
// "ok" don't false-positive inside unrelated words like "numbers" or "look".
function containsAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => new RegExp(`\\b${escapeRegExp(needle)}\\b`, 'i').test(haystack));
}

function startsWithAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => new RegExp(`^${escapeRegExp(needle)}\\b`, 'i').test(haystack));
}

function countExclamations(text: string): number {
  return (text.match(/!/g) ?? []).length;
}

/**
 * Classifies a plaintext message into one coarse intent category. Deterministic,
 * first-match-wins against a fixed priority order. Never throws — always returns a category
 * (GENERAL is the fallback default).
 */
export function classifyIntent(content: string): IntentCategory {
  if (!content) return 'GENERAL';

  const trimmed = content.trim();
  const lower = trimmed.toLowerCase();
  const firstWord = lower.split(/\s+/)[0]?.replace(/[^a-z']/g, '') ?? '';

  if (containsAny(lower, URGENT_KEYWORDS) || countExclamations(trimmed) >= 2) {
    return 'URGENT';
  }

  if (trimmed.endsWith('?') || INTERROGATIVE_STARTERS.includes(firstWord)) {
    return 'QUESTION';
  }

  if (startsWithAny(lower, GREETING_KEYWORDS)) {
    return 'GREETING';
  }

  if (containsAny(lower, TIME_KEYWORDS) || TIME_PATTERN.test(lower)) {
    return 'TIME';
  }

  if (containsAny(lower, LOCATION_KEYWORDS)) {
    return 'LOCATION';
  }

  if (containsAny(lower, REQUEST_KEYWORDS)) {
    return 'REQUEST';
  }

  if (containsAny(lower, NEGATION_KEYWORDS)) {
    return 'NEGATION';
  }

  if (containsAny(lower, AFFIRMATION_KEYWORDS)) {
    return 'AFFIRMATION';
  }

  if (containsAny(lower, FAREWELL_KEYWORDS)) {
    return 'FAREWELL';
  }

  if (containsAny(lower, ACKNOWLEDGEMENT_KEYWORDS)) {
    return 'ACKNOWLEDGEMENT';
  }

  return 'GENERAL';
}
