/**
 * The questionnaire, v1 (fixed for the family run; per-group custom questions come in Phase 3).
 * Shared by the web app and, later, the mobile app.
 */
export type Question =
  | { key: string; kind: "text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "long_text"; label: string; hint?: string; required?: boolean; maxLength: number }
  | { key: string; kind: "choice"; label: string; hint?: string; required?: boolean; options: readonly string[] };

export interface Section {
  title: string;
  questions: readonly Question[];
}

const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;

export const QUESTIONNAIRE: readonly Section[] = [
  {
    title: "About you",
    questions: [
      { key: "hobbies", kind: "long_text", label: "Hobbies and interests", hint: "What do you do for fun?", required: true, maxLength: 1000 },
      { key: "loves", kind: "long_text", label: "Things you love", hint: "Brands, colors, scents, foods, styles…", required: true, maxLength: 1000 },
      { key: "please_no", kind: "long_text", label: "Please no…", hint: "Things you don't want or already have plenty of", required: true, maxLength: 1000 },
      { key: "fandoms", kind: "long_text", label: "Teams, shows, books, music, games", maxLength: 1000 },
    ],
  },
  {
    title: "Treats and favorites",
    questions: [
      { key: "favorite_colors", kind: "text", label: "Favorite colors", maxLength: 200 },
      { key: "treats", kind: "long_text", label: "Favorite snacks and drinks", hint: "Coffee or tea order, wine, candy…", maxLength: 1000 },
      { key: "stores", kind: "long_text", label: "Favorite stores or websites", maxLength: 1000 },
      {
        key: "experiences",
        kind: "choice",
        label: "Experience gifts (tickets, classes, outings)?",
        options: ["Love them", "Fine either way", "I'd rather have a thing"],
      },
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
      { key: "allergies", kind: "text", label: "Allergies or sensitivities", hint: "Food, fragrance, materials…", maxLength: 300 },
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
