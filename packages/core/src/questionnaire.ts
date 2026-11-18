/**
 * The questionnaire (fixed for the family run; per-group custom questions come in Phase 3).
 * Shared by the web app and, later, the mobile app. Its purpose is to help a Secret Santa get
 * to know the person they're buying for, not just collect a shopping list.
 *
 * Some keys are relied on elsewhere, so keep them when rewording:
 * `hobbies`, `loves`, `please_no` (required), `please_no` + `allergies` (gift engine "avoid"
 * rules), `keep_or_do` (experience gifts), sizes (`*_size`).
 */
export interface ThisOrThatOption {
  label: string;
  emoji: string;
}

/** One entrant in a bracket question: a name, a picture (path under /public) and a kid-friendly one-liner. */
export interface BracketOption {
  label: string;
  image: string;
  blurb: string;
}

export type Question =
  | { key: string; kind: "text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "long_text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "choice"; label: string; hint?: string; required?: boolean; options: readonly string[] }
  /** Two options side by side, plus "Both!" and "Neither". The label reads "Coffee or tea?". */
  | { key: string; kind: "this_or_that"; label: string; hint?: string; required?: boolean; options: readonly [ThisOrThatOption, ThisOrThatOption] }
  /**
   * A mini single-elimination tournament of this-or-that picks that ends in ONE favorite
   * (see `bracketNext`). Stores the winning option's label, or `BRACKET_SKIP`. Exactly 6 options.
   * `hint` is the line that introduces it.
   */
  | { key: string; kind: "bracket"; label: string; hint?: string; required?: boolean; options: readonly BracketOption[] };

export interface Section {
  title: string;
  /** One friendly line under the section title. */
  intro?: string;
  questions: readonly Question[];
}

/** Extra answers every this-or-that question accepts. */
export const BOTH = "Both!";
export const NEITHER = "Neither";

/** The answer for someone who'd rather skip the squishy showdown. */
export const BRACKET_SKIP = "Not into squishies";

/** Images live in apps/web/public/squishies/ (see the README there); replace a file without touching code. */
export const SQUISHY_STYLES: readonly BracketOption[] = [
  { label: "Slow-rising foam", image: "/squishies/slow-rising-foam.svg", blurb: "Squish it flat and it slowly puffs back up" },
  { label: "Mochi", image: "/squishies/mochi.svg", blurb: "Small, soft and stretchy" },
  { label: "Crunchy", image: "/squishies/crunchy.svg", blurb: "Filled with beads, crunches when squeezed" },
  { label: "Vaseline-filled", image: "/squishies/vaseline-filled.svg", blurb: "Smooth, gooey squish" },
  { label: "Squeezy dough & gel", image: "/squishies/dough-gel.svg", blurb: "Stress-ball style, filled with dough or gel" },
  { label: "Plush", image: "/squishies/plush.svg", blurb: "Pillowy stuffed squishy" },
];

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

function pair(key: string, a: [string, string], b: [string, string]): Question {
  return {
    key,
    kind: "this_or_that",
    label: `${a[1]} or ${b[1].toLowerCase()}?`,
    options: [
      { emoji: a[0], label: a[1] },
      { emoji: b[0], label: b[1] },
    ],
  };
}

export const QUESTIONNAIRE: readonly Section[] = [
  {
    title: "Sizes",
    questions: [
      { key: "shirt_size", kind: "choice", label: "Shirt / top size", options: SHIRT_SIZES },
      { key: "pants_size", kind: "text", label: "Pants size", hint: "e.g. 32x30 or 8", maxLength: 50 },
      { key: "shoe_size", kind: "text", label: "Shoe size", hint: "e.g. US men's 10", maxLength: 50 },
      { key: "other_sizes", kind: "text", label: "Other sizes (hat, gloves, ring…)", maxLength: 200 },
    ],
  },
  {
    title: "This or that",
    intro: "Go with your gut. Tap one, or pick “Both!” if you really can't choose.",
    questions: [
      pair("coffee_tea", ["☕", "Coffee"], ["🍵", "Tea"]),
      pair("sweet_salty", ["🍫", "Sweet"], ["🥨", "Salty"]),
      pair("night_in_out", ["🏡", "Cozy night in"], ["🎉", "Night out"]),
      pair("beach_mountains", ["🏖️", "Beach"], ["🏔️", "Mountains"]),
      pair("books_movies", ["📚", "Books"], ["🎬", "Movies"]),
      pair("cook_order", ["🍳", "Cook it"], ["🥡", "Order it"]),
      pair("useful_fancy", ["🧰", "Useful"], ["💎", "Fancy"]),
      pair("classic_trendy", ["🎩", "Classic"], ["✨", "Trendy"]),
      pair("comfy_dressed", ["🧦", "Comfy"], ["👔", "Dressed up"]),
      pair("outdoors_indoors", ["🥾", "Outdoors"], ["🛋️", "Indoors"]),
      pair("gadgets_handmade", ["🔌", "Gadgets"], ["🧶", "Handmade"]),
      pair("keep_or_do", ["🎁", "Something to keep"], ["🎟️", "Something to do"]),
      pair("real_fake_tree", ["🌲", "Real tree"], ["🎄", "Fake tree"]),
      {
        key: "squishy_favorite",
        kind: "bracket",
        label: "Favorite squishy style",
        hint: "Squishy showdown! Pick your favorite in each match until one wins.",
        options: SQUISHY_STYLES,
      },
    ],
  },
  {
    title: "Get to know you",
    intro: "Help your Secret Santa get to know you a little better.",
    questions: [
      { key: "hobbies", kind: "long_text", label: "What do you love doing with a free afternoon?", required: true, maxLength: 1000 },
      {
        key: "this_year",
        kind: "long_text",
        label: "What's been new or exciting in your life this year?",
        hint: "A new job, a trip, a hobby, a move, a grandkid…",
        maxLength: 1000,
      },
      { key: "want_to_try", kind: "long_text", label: "Something you've always wanted to try or learn", maxLength: 1000 },
      { key: "fandoms", kind: "long_text", label: "Shows, books, podcasts, teams or music you're into right now", maxLength: 1000 },
      {
        key: "loves",
        kind: "long_text",
        label: "A few little things that always make you happy",
        hint: "A smell, a snack, a place, a brand, a color…",
        required: true,
        maxLength: 1000,
      },
    ],
  },
  {
    title: "Good to know",
    questions: [
      { key: "please_no", kind: "long_text", label: "Please no…", hint: "Things you don't want or already have plenty of", required: true, maxLength: 1000 },
      { key: "allergies", kind: "text", label: "Allergies or sensitivities", hint: "Food, fragrance, materials…", maxLength: 300 },
    ],
  },
];

export const ALL_QUESTIONS: readonly Question[] = QUESTIONNAIRE.flatMap((s) => s.questions);

export type Answers = Record<string, string>;

/**
 * Cleans raw form input: keeps only known questions, trims, enforces length and
 * allowed choices. Unknown keys and invalid choices are dropped.
 */
export function cleanAnswers(raw: Record<string, unknown>): Answers {
  const out: Answers = {};
  for (const q of ALL_QUESTIONS) {
    const value = raw[q.key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (q.kind === "choice") {
      if (q.options.includes(trimmed)) out[q.key] = trimmed;
    } else if (q.kind === "this_or_that") {
      if (thisOrThatValues(q).includes(trimmed)) out[q.key] = trimmed;
    } else if (q.kind === "bracket") {
      if (bracketValues(q).includes(trimmed)) out[q.key] = trimmed;
    } else {
      out[q.key] = trimmed.slice(0, q.maxLength);
    }
  }
  return out;
}

/** Complete when every required question has an answer. Partial saves are always allowed. */
export function isComplete(answers: Answers): boolean {
  return ALL_QUESTIONS.every((q) => !q.required || Boolean(answers[q.key]));
}


/** Every answer a this-or-that question accepts. */
export function thisOrThatValues(q: Extract<Question, { kind: "this_or_that" }>): string[] {
  return [q.options[0].label, q.options[1].label, BOTH, NEITHER];
}

export const THIS_OR_THAT: readonly Extract<Question, { kind: "this_or_that" }>[] = ALL_QUESTIONS.filter(
  (q): q is Extract<Question, { kind: "this_or_that" }> => q.kind === "this_or_that",
);

/** The person's this-or-that picks, in questionnaire order, with the emoji of what they chose. */
export function thisOrThatPicks(answers: Answers): { key: string; label: string; emoji: string }[] {
  const out: { key: string; label: string; emoji: string }[] = [];
  for (const q of THIS_OR_THAT) {
    const v = answers[q.key];
    if (!v || v === NEITHER) continue;
    if (v === BOTH) out.push({ key: q.key, label: `${q.options[0].label} and ${q.options[1].label.toLowerCase()}`, emoji: q.options[0].emoji + q.options[1].emoji });
    else {
      const o = q.options.find((x) => x.label === v);
      if (o) out.push({ key: q.key, label: o.label, emoji: o.emoji });
    }
  }
  return out;
}

/** Every answer a bracket question accepts: one of its options, or the skip answer. */
export function bracketValues(q: Extract<Question, { kind: "bracket" }>): string[] {
  return [...q.options.map((o) => o.label), BRACKET_SKIP];
}

export const BRACKETS: readonly Extract<Question, { kind: "bracket" }>[] = ALL_QUESTIONS.filter(
  (q): q is Extract<Question, { kind: "bracket" }> => q.kind === "bracket",
);

/** The favorite squishy style they ended up with (with its picture), or null if blank or skipped. */
export function squishyFavorite(answers: Answers): BracketOption | null {
  const q = BRACKETS.find((b) => b.key === "squishy_favorite");
  const v = answers.squishy_favorite;
  return q?.options.find((o) => o.label === v) ?? null;
}

export const BRACKET_MATCHES = 5;

export type BracketRound = "Round 1" | "Round 2" | "Final";

export type BracketStep =
  | {
      kind: "match";
      /** 1-based: "Match 2 of 5". */
      number: number;
      of: typeof BRACKET_MATCHES;
      round: BracketRound;
      a: string;
      b: string;
      /** In round 2, the entrant that got a bye and waits in the final. */
      waiting?: string;
    }
  | { kind: "winner"; winner: string };

/**
 * Where a 6-entrant bracket stands, given the entrants in seed order and the winners picked so far.
 * Round 1: 1v2, 3v4, 5v6. Round 2: winner 1 v winner 2 (winner 3 gets a bye). Final: that winner
 * v winner 3. Five picks in all. Picks that don't belong to the current match are ignored from
 * that point on, so a stale list can never skip ahead.
 */
export function bracketNext(entrants: readonly string[], picks: readonly string[]): BracketStep {
  if (entrants.length !== 6) throw new Error("A bracket needs exactly 6 entrants");
  const [e1, e2, e3, e4, e5, e6] = entrants as [string, string, string, string, string, string];
  const winners: string[] = [];
  for (let n = 1; n <= BRACKET_MATCHES; n++) {
    const [a, b, round, waiting] = ((): [string, string, BracketRound, string | undefined] => {
      if (n === 1) return [e1, e2, "Round 1", undefined];
      if (n === 2) return [e3, e4, "Round 1", undefined];
      if (n === 3) return [e5, e6, "Round 1", undefined];
      if (n === 4) return [winners[0]!, winners[1]!, "Round 2", winners[2]];
      return [winners[3]!, winners[2]!, "Final", undefined];
    })();
    const pick = picks[n - 1];
    if (pick !== a && pick !== b) return { kind: "match", number: n, of: BRACKET_MATCHES, round, a, b, ...(waiting ? { waiting } : {}) };
    winners.push(pick);
  }
  return { kind: "winner", winner: winners[4]! };
}
