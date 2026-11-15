/**
 * A second line of defense for "Please no…" and allergies. The prompt is the first: it tells
 * the model to avoid these, and the model understands meaning ("I'm vegan" rules out leather).
 * This checker only catches the literal slips: an idea whose title, search words or materials
 * repeat a short phrase the giftee asked not to get.
 *
 * It looks only at what the Santa would buy or use (title, search_keywords, materials), never at
 * the reason, because a good reason may say "since you said no candles…".
 */
import type { Answers } from "../questionnaire.js";
import type { GiftIdeas } from "./schema.js";

/** Words that carry no meaning on their own in a "please no" answer. */
const FILLER = new Set(
  (
    "a an the and or but nor of to for in on at by with from into about as is are am be been was were " +
    "i i'm im i've ive i'll ill i'd we'll you'll will would could should can can't cant won't wont might " +
    "me my mine we our you your it its it's this that these those there here " +
    "no not none nothing never please don't dont do does doesn't need needs want wants more any anything " +
    "anymore again extra else other others own already enough plenty too many much lots lot really very so just " +
    "stuff things thing items item kind kinds type types sort sorts etc like hate dislike love avoid " +
    "allergic allergy allergies sensitive sensitivity sensitivities intolerant intolerance reaction severe mild " +
    "have has had get gets got give given use used make makes all every some one ones am" +
    " because since though although which who what when where how" +
    // Words that describe a reaction rather than the thing: "Wool makes me itch" -> "wool".
    " makes made gives gave cause causes caused itch itchy itches rash rashes hive hives migraine migraines" +
    " headache headaches sneeze sneezing break breaks out bother bothers upset upsets trigger triggers"
  ).split(/\s+/),
);

/** Answers that mean "nothing to avoid". */
const NOTHING = /^(none|n\/?a|no|nope|nothing|nil|-+|no allergies|none known|not that i know of)[.!]*$/i;

/** A sentence that says what they would like rather than what to avoid. */
const WANTED = /\b(only|instead|prefer|preferably|rather|welcome|love|loves|enjoy|enjoys)\b/i;
/** A sentence about who they are ("I'm vegan", "I'm sober"), not a thing to avoid. "I'm allergic to…" still counts. */
const ABOUT_ME = /^\s*(i['’]?m|i am)\s+(?!allergic|sensitive|intolerant)/i;

/** Longest phrase (in meaningful words) the checker will look for. Longer clauses are left to the prompt. */
const MAX_PHRASE_WORDS = 3;

/** Crude singular form, so "candles" matches "candle" and "berries" matches "berry". */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies")) return `${word.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) return word.slice(0, -1);
  return word;
}

/** Lowercase meaningful-word tokens, singular. "Scented-candles!" -> ["scented", "candle"]. */
export function avoidTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w))
    .map(singular);
}

/**
 * Short phrases to avoid, from free text. Splits into sentences, skips sentences that say what
 * they want ("consumables only"), splits the rest on commas and "and"/"or", keeps clauses of
 * 1–3 meaningful words, and returns each as space-joined singular tokens.
 * "No candles, mugs or anything scented. Wool makes me itch" ->
 *   ["candle", "mug", "scented", "wool"]
 */
export function avoidPhrases(text: string | undefined): string[] {
  if (!text || NOTHING.test(text.trim())) return [];
  const out = new Set<string>();
  for (const sentence of text.split(/[.!?\n;]+|\s+-\s+|—|–|\s+but\s+/i)) {
    // "consumables or experiences only please" says what they DO want; skip it.
    if (WANTED.test(sentence) || ABOUT_ME.test(sentence)) continue;
    for (const clause of sentence.split(/[,:()/]+|\s+(?:and|or|nor|plus|&)\s+/i)) {
      const t = avoidTokens(clause);
      if (t.length >= 1 && t.length <= MAX_PHRASE_WORDS) out.add(t.join(" "));
    }
  }
  return [...out];
}

/** Phrases from the giftee's "Please no…" and allergies answers. */
export function avoidPhrasesFromAnswers(answers: Answers): string[] {
  return [...new Set([...avoidPhrases(answers.please_no), ...avoidPhrases(answers.allergies)])];
}

export interface AvoidConflict {
  list: "retail" | "diy";
  index: number;
  /** The phrase that matched, as normalized tokens. */
  phrase: string;
}

function containsSequence(haystack: string[], needle: string[]): boolean {
  if (!needle.length || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * Ideas whose title, search words or materials contain one of `phrases` (as returned by
 * `avoidPhrases`, or any plain words: they are normalized here too).
 * One entry per (idea, phrase) pair.
 */
export function findAvoidConflicts(ideas: GiftIdeas, phrases: readonly string[]): AvoidConflict[] {
  const needles = [...new Set(phrases.map((p) => avoidTokens(p).join(" ")).filter(Boolean))].map((p) => p.split(" "));
  const out: AvoidConflict[] = [];
  const check = (list: "retail" | "diy", index: number, texts: string[]) => {
    const hays = texts.map(avoidTokens);
    for (const n of needles) {
      if (hays.some((hay) => containsSequence(hay, n))) out.push({ list, index, phrase: n.join(" ") });
    }
  };
  ideas.retail.forEach((r, i) => check("retail", i, [r.title, r.search_keywords]));
  ideas.diy.forEach((d, i) => check("diy", i, [d.title, ...d.materials]));
  return out;
}
