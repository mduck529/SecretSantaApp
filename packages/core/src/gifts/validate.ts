/**
 * Checks a model answer before it is stored or shown. Structured outputs guarantee the JSON
 * shape; this adds what JSON Schema cannot express (counts, lengths, budget) and the rules that
 * depend on the giftee's answers (please-no, allergies, experience gifts, answered questions).
 */
import type { Budget } from "../budget.js";
import { ALL_QUESTIONS, type Answers } from "../questionnaire.js";
import { avoidPhrasesFromAnswers, findAvoidConflicts } from "./avoid.js";
import {
  BASED_ON_KEYS,
  DIFFICULTIES,
  DIY_IDEA_COUNT,
  LIMITS,
  RETAIL_IDEA_COUNT,
  SHOPS,
  TIMES_NEEDED,
  type DiyIdea,
  type GiftIdeas,
  type RetailIdea,
} from "./schema.js";

export type GiftProblemCode =
  | "shape" // not the expected JSON shape
  | "count" // wrong number of retail or DIY ideas
  | "text" // empty or too long text, or a link in the text
  | "duplicate" // two ideas with the same title
  | "budget" // price outside the group budget
  | "please_no" // matches something from "Please no…" or allergies
  | "experience" // experience gift for someone who said "I'd rather have a thing"
  | "based_on"; // reason claims an answer the giftee did not give

export interface GiftProblem {
  code: GiftProblemCode;
  /** The idea at fault, when there is one: "retail[1]", "diy[0]". */
  at?: string;
  message: string;
}

export interface GiftCheckContext {
  budget: Budget;
  answers: Answers;
  /** Extra phrases to treat like "Please no…" (the eval set's `mustAvoid`). */
  extraAvoid?: readonly string[];
}

export interface GiftCheckResult {
  /** The parsed ideas, or null when the shape is too broken to read. */
  ideas: GiftIdeas | null;
  problems: GiftProblem[];
}

/**
 * Whole-dollar price range a retail idea must land in. A fixed budget ("$50") gets 10% of
 * room below it, because nobody prices a gift at exactly $50.
 */
export function retailPriceRange(budget: Budget): { min: number; max: number } {
  const max = Math.floor(budget.maxCents / 100);
  let min = Math.ceil(budget.minCents / 100);
  if (min >= max) min = Math.floor(max * 0.9);
  return { min, max };
}

/** DIY materials may cost anything from $0 up to the budget maximum. */
export function diyCostMax(budget: Budget): number {
  return Math.floor(budget.maxCents / 100);
}

const ANSWERABLE = new Set(ALL_QUESTIONS.map((q) => q.key));
const BASED_ON = new Set<string>(BASED_ON_KEYS);
const LINK = /https?:\/\/|www\.|\.com\b/i;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

function readRetail(v: unknown): RetailIdea | null {
  if (!isObj(v)) return null;
  const { title, reason, based_on, estimated_price_usd, search_keywords, best_shop, is_experience } = v;
  if (!isStr(title) || !isStr(reason) || !isStr(based_on) || !isInt(estimated_price_usd)) return null;
  if (!isStr(search_keywords) || !isStr(best_shop) || typeof is_experience !== "boolean") return null;
  if (!(SHOPS as readonly string[]).includes(best_shop)) return null;
  return { title, reason, based_on, estimated_price_usd, search_keywords, best_shop: best_shop as RetailIdea["best_shop"], is_experience };
}

function readDiy(v: unknown): DiyIdea | null {
  if (!isObj(v)) return null;
  const { title, reason, based_on, estimated_cost_usd, materials, how_to, difficulty, time_needed } = v;
  if (!isStr(title) || !isStr(reason) || !isStr(based_on) || !isInt(estimated_cost_usd) || !isStr(how_to)) return null;
  if (!Array.isArray(materials) || !materials.every(isStr)) return null;
  if (!isStr(difficulty) || !(DIFFICULTIES as readonly string[]).includes(difficulty)) return null;
  if (!isStr(time_needed) || !(TIMES_NEEDED as readonly string[]).includes(time_needed)) return null;
  return {
    title,
    reason,
    based_on,
    estimated_cost_usd,
    materials,
    how_to,
    difficulty: difficulty as DiyIdea["difficulty"],
    time_needed: time_needed as DiyIdea["time_needed"],
  };
}

/** Reads and trims the raw model output. Returns null if any idea is missing a field or has the wrong type. */
export function parseGiftIdeas(raw: unknown): GiftIdeas | null {
  if (!isObj(raw) || !Array.isArray(raw.retail) || !Array.isArray(raw.diy)) return null;
  const retail = raw.retail.map(readRetail);
  const diy = raw.diy.map(readDiy);
  if (retail.some((r) => !r) || diy.some((d) => !d)) return null;
  const trim = <T extends { title: string; reason: string }>(i: T): T => ({ ...i, title: i.title.trim(), reason: i.reason.trim() });
  return {
    retail: (retail as RetailIdea[]).map((r) => ({ ...trim(r), search_keywords: r.search_keywords.trim() })),
    diy: (diy as DiyIdea[]).map((d) => ({
      ...trim(d),
      how_to: d.how_to.trim(),
      materials: d.materials.map((m) => m.trim()).filter(Boolean),
    })),
  };
}

/**
 * Validates model output against the schema, the budget and the giftee's answers.
 * An empty `problems` list means the ideas may be stored and shown.
 */
export function validateGiftIdeas(raw: unknown, ctx: GiftCheckContext): GiftCheckResult {
  const ideas = parseGiftIdeas(raw);
  if (!ideas) return { ideas: null, problems: [{ code: "shape", message: "The answer does not match the gift ideas schema." }] };

  const problems: GiftProblem[] = [];
  const add = (code: GiftProblemCode, message: string, at?: string) => problems.push(at ? { code, at, message } : { code, message });

  if (ideas.retail.length !== RETAIL_IDEA_COUNT) {
    add("count", `Expected ${RETAIL_IDEA_COUNT} retail ideas, got ${ideas.retail.length}.`);
  }
  if (ideas.diy.length !== DIY_IDEA_COUNT) {
    add("count", `Expected ${DIY_IDEA_COUNT} DIY ideas, got ${ideas.diy.length}.`);
  }

  const answered = new Set(Object.keys(ctx.answers).filter((k) => ANSWERABLE.has(k) && ctx.answers[k]?.trim()));
  const checkCommon = (at: string, i: { title: string; reason: string; based_on: string }) => {
    if (!i.title || i.title.length > LIMITS.titleChars) add("text", `Title must be 1-${LIMITS.titleChars} characters.`, at);
    if (!i.reason || i.reason.length > LIMITS.reasonChars) add("text", `Reason must be 1-${LIMITS.reasonChars} characters.`, at);
    if (LINK.test(i.title) || LINK.test(i.reason)) add("text", "Ideas must not contain links.", at);
    if (!BASED_ON.has(i.based_on)) add("based_on", `Unknown question "${i.based_on}".`, at);
    else if (i.based_on !== "general" && !answered.has(i.based_on)) {
      add("based_on", `Reason cites "${i.based_on}", which they did not answer.`, at);
    }
  };

  const price = retailPriceRange(ctx.budget);
  const preferThings = ctx.answers.experiences === "I'd rather have a thing";
  ideas.retail.forEach((r, n) => {
    const at = `retail[${n}]`;
    checkCommon(at, r);
    const words = r.search_keywords.split(/\s+/).filter(Boolean).length;
    if (
      words < LIMITS.searchKeywordsWords.min ||
      words > LIMITS.searchKeywordsWords.max ||
      r.search_keywords.length > LIMITS.searchKeywordsChars ||
      LINK.test(r.search_keywords)
    ) {
      add("text", `Search keywords must be ${LIMITS.searchKeywordsWords.min}-${LIMITS.searchKeywordsWords.max} plain words.`, at);
    }
    if (r.estimated_price_usd < price.min || r.estimated_price_usd > price.max) {
      add("budget", `Price $${r.estimated_price_usd} is outside $${price.min}-$${price.max}.`, at);
    }
    if (preferThings && r.is_experience) add("experience", "They said they'd rather have a thing than an experience.", at);
  });

  const costMax = diyCostMax(ctx.budget);
  ideas.diy.forEach((d, n) => {
    const at = `diy[${n}]`;
    checkCommon(at, d);
    if (!d.how_to || d.how_to.length > LIMITS.howToChars) add("text", `How-to must be 1-${LIMITS.howToChars} characters.`, at);
    if (d.materials.length < LIMITS.materials.min || d.materials.length > LIMITS.materials.max) {
      add("text", `List ${LIMITS.materials.min}-${LIMITS.materials.max} materials.`, at);
    }
    if (d.materials.some((m) => m.length > LIMITS.materialChars || LINK.test(m))) {
      add("text", `Each material must be a short name under ${LIMITS.materialChars} characters.`, at);
    }
    if (d.estimated_cost_usd < 0 || d.estimated_cost_usd > costMax) {
      add("budget", `Materials cost $${d.estimated_cost_usd} is outside $0-$${costMax}.`, at);
    }
  });

  const seen = new Map<string, string>();
  [...ideas.retail.map((r, n) => [`retail[${n}]`, r.title] as const), ...ideas.diy.map((d, n) => [`diy[${n}]`, d.title] as const)].forEach(
    ([at, title]) => {
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const first = seen.get(key);
      if (first) add("duplicate", `Same idea as ${first}.`, at);
      else seen.set(key, at);
    },
  );

  const phrases = [...avoidPhrasesFromAnswers(ctx.answers), ...(ctx.extraAvoid ?? [])];
  for (const c of findAvoidConflicts(ideas, phrases)) {
    add("please_no", `Contains "${c.phrase}", which they asked not to get or are sensitive to.`, `${c.list}[${c.index}]`);
  }

  return { ideas, problems };
}

/** Problems that are about one idea (and can be fixed by dropping it), grouped by idea. */
export function problemsByIdea(problems: readonly GiftProblem[]): Map<string, GiftProblem[]> {
  const out = new Map<string, GiftProblem[]>();
  for (const p of problems) {
    if (!p.at) continue;
    out.set(p.at, [...(out.get(p.at) ?? []), p]);
  }
  return out;
}

/**
 * Removes the ideas that have problems. Use after the one retry has also failed: showing four
 * good ideas beats showing none. Returns null if nothing usable is left or a problem is not
 * tied to one idea (wrong shape).
 */
export function keepCleanIdeas(result: GiftCheckResult): GiftIdeas | null {
  if (!result.ideas || result.problems.some((p) => !p.at && p.code !== "count")) return null;
  const bad = problemsByIdea(result.problems);
  const retail = result.ideas.retail.filter((_, n) => !bad.has(`retail[${n}]`)).slice(0, RETAIL_IDEA_COUNT);
  const diy = result.ideas.diy.filter((_, n) => !bad.has(`diy[${n}]`)).slice(0, DIY_IDEA_COUNT);
  return retail.length + diy.length > 0 ? { retail, diy } : null;
}
