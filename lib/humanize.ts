/**
 * Post-processing for model output.
 *
 * The prompt already asks for plain writing, but prompts drift, so anything
 * that comes back is cleaned here as well. Two jobs: drop the punctuation that
 * makes text read like it was generated, and swap out the filler words that
 * show up in almost every model draft. Everything is applied to strings only,
 * so numbers, arrays and nested objects keep their shape.
 */

/** Shown to every model call so the first draft starts close to the target. */
export const HUMAN_VOICE_RULES = `Voice rules:
- Write the way a founder types a message to another founder. Short sentences.
- Never use an em dash or an en dash. Use a comma, a period or a colon instead.
- Do not use these words: leverage, seamless, robust, unlock, elevate, delve, empower, supercharge, game changer, cutting edge, revolutionize, utilize.
- No "not just X, it's Y" constructions. No rhetorical questions in a row.
- Do not open with "In today's fast-paced" or anything close to it.
- No emoji, no hashtags, no bold text.`;

const PHRASE_SWAPS: Array<[RegExp, string]> = [
  [/\bdelve into\b/gi, "look at"],
  [/\bdelve\b/gi, "dig"],
  [/\bleveraging\b/gi, "using"],
  [/\bleverages\b/gi, "uses"],
  [/\bleveraged\b/gi, "used"],
  [/\bleverage\b/gi, "use"],
  [/\bseamlessly\b/gi, "smoothly"],
  [/\bseamless\b/gi, "smooth"],
  [/\brobust\b/gi, "solid"],
  [/\bcutting[- ]edge\b/gi, "modern"],
  [/\bgame[- ]changing\b/gi, "useful"],
  [/\bgame[- ]changers?\b/gi, "useful tool"],
  [/\bsupercharge\b/gi, "speed up"],
  [/\bsupercharges\b/gi, "speeds up"],
  [/\bunlocking\b/gi, "opening"],
  [/\bunlocks\b/gi, "opens"],
  [/\bunlock\b/gi, "open"],
  [/\bempowering\b/gi, "helping"],
  [/\bempowers\b/gi, "helps"],
  [/\bempower\b/gi, "help"],
  [/\belevates\b/gi, "improves"],
  [/\belevate\b/gi, "improve"],
  [/\brevolutionizing\b/gi, "changing"],
  [/\brevolutionize\b/gi, "change"],
  [/\butilizing\b/gi, "using"],
  [/\butilize\b/gi, "use"],
  [/\bin today's fast[- ]paced\b/gi, "in a busy"],
  [/\bharness(es|ing)?\b/gi, "use"],
];

/**
 * Turn em and en dashes into ordinary punctuation.
 *
 * A dash between two digits stays a hyphen because it is almost always a range
 * ("5-7 days"). Everywhere else the dash becomes a comma, or a period when the
 * next word starts a new sentence.
 */
export function normalizeDashes(input: string): string {
  return input.replace(
    /(\S)\s*[\u2014\u2013]\s*(\S)/g,
    (_match, before: string, after: string) => {
      if (/\d/.test(before) && /\d/.test(after)) return `${before}-${after}`;
      if (/[A-Z]/.test(after) && !/[.!?,:;]$/.test(before)) {
        return `${before}. ${after}`;
      }
      if (/[,.:;!?]$/.test(before)) return `${before} ${after}`;
      return `${before}, ${after}`;
    }
  );
}

function tidyPunctuation(input: string): string {
  return input
    .replace(/[ \t]+/g, " ")
    .replace(/ +([,.;:!?])/g, "$1")
    .replace(/,\s*,/g, ",")
    .replace(/\.\s*\./g, ".")
    .replace(/,\s*\./g, ".")
    .replace(/^[\s,;:]+/, "")
    .replace(/[ \t]+\n/g, "\n");
}

/** Keep the capital letter the original phrase had. */
function matchCase(original: string, replacement: string): string {
  if (!original || !replacement) return replacement;
  if (original[0] !== original[0].toUpperCase()) return replacement;
  return replacement[0].toUpperCase() + replacement.slice(1);
}

/** Clean one string. Safe to call on already clean text. */
export function humanizeText(input: string): string {
  if (!input) return input;
  let out = normalizeDashes(input);
  for (const [pattern, replacement] of PHRASE_SWAPS) {
    out = out.replace(pattern, (matched: string) =>
      matchCase(matched, replacement)
    );
  }
  return tidyPunctuation(out);
}

/** Same as humanizeText, but walks arrays and objects. */
export function humanizeDeep<T>(value: T): T {
  if (typeof value === "string") return humanizeText(value) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((item) => humanizeDeep(item)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = humanizeDeep(item);
    }
    return out as T;
  }
  return value;
}
