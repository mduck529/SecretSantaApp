/**
 * The questionnaire (fixed for the family run; per-group custom questions come in Phase 3).
 * Shared by the web app and, later, the mobile app. Its purpose is to help a Secret Santa get
 * to know the person they're buying for, not just collect a shopping list.
 *
 * Some keys are relied on elsewhere, so keep them when rewording:
 * `hobbies`, `loves`, `please_no` (required), `please_no` + `allergies` (gift engine "avoid"
 * rules), `keep_or_do` (experience gifts), `wishlist` (links), sizes (`*_size`).
 */
export interface ThisOrThatOption {
  label: string;
  emoji: string;
}

export type Question =
  | { key: string; kind: "text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "long_text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "choice"; label: string; hint?: string; required?: boolean; options: readonly string[] }
  /** Two options side by side, plus "Both!" and "Neither". The label reads "Coffee or tea?". */
  | { key: string; kind: "this_or_that"; label: string; hint?: string; required?: boolean; options: readonly [ThisOrThatOption, ThisOrThatOption] };

export interface Section {
  title: string;
  /** One friendly line under the section title. */
  intro?: string;
  questions: readonly Question[];
}

/** Extra answers every this-or-that question accepts. */
export const BOTH = "Both!";
export const NEITHER = "Neither";

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
    ],
  },
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
    title: "Good to know",
    questions: [
      { key: "please_no", kind: "long_text", label: "Please no…", hint: "Things you don't want or already have plenty of", required: true, maxLength: 1000 },
      { key: "allergies", kind: "text", label: "Allergies or sensitivities", hint: "Food, fragrance, materials…", maxLength: 300 },
      { key: "dream_gift", kind: "long_text", label: "If money were no object, what would you ask Santa for?", hint: "Just for fun", maxLength: 500 },
      { key: "wishlist", kind: "long_text", label: "Wish list links", hint: "One link per line", maxLength: 3000 },
      { key: "anything_else", kind: "long_text", label: "Anything else your Secret Santa should know?", maxLength: 1000 },
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

/** Pulls http(s) links out of the wish list answer. */
export function wishlistLinks(answers: Answers): string[] {
  return (answers.wishlist ?? "")
    .split(/\s+/)
    .filter((s) => /^https?:\/\/[^\s<>"]+$/i.test(s));
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
