/**
 * Gift ideas: the typed output schema the model must fill in, and the JSON Schema sent to the
 * Claude API as `output_config.format`. See docs/GIFT-IDEAS.md for the full design.
 *
 * The same shape is stored in `gift_suggestions.ideas` after it passes `validateGiftIdeas`.
 */
import { ALL_QUESTIONS } from "../questionnaire.js";

/** Every set of ideas has exactly this many of each kind. */
export const RETAIL_IDEA_COUNT = 3;
export const DIY_IDEA_COUNT = 2;

/**
 * Which answer an idea's reason draws on: a questionnaire key, or "general" when the giftee
 * left nothing usable (empty or sizes-only profile).
 */
export const BASED_ON_KEYS = [...ALL_QUESTIONS.map((q) => q.key), "general"] as const;
export type BasedOn = string; // one of BASED_ON_KEYS; kept as string because question keys are data

export const SHOPS = ["amazon", "etsy", "target", "any"] as const;
export type Shop = (typeof SHOPS)[number];

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const TIMES_NEEDED = ["under_1_hour", "a_few_hours", "a_weekend"] as const;
export type TimeNeeded = (typeof TIMES_NEEDED)[number];

/** Something to buy. */
export interface RetailIdea {
  /** Short, specific name of the gift: "Fly-tying kit with vise and starter feathers". */
  title: string;
  /** One sentence tied to what the giftee wrote: "They tie their own flies on winter weekends." */
  reason: string;
  /** The question key the reason draws on, or "general". */
  based_on: BasedOn;
  /** Realistic US price in whole dollars, inside the group budget. */
  estimated_price_usd: number;
  /** 3–6 words a person would type into a store search box. Used to build shop links. */
  search_keywords: string;
  /** Where it is easiest to find. "any" when every big store has it. */
  best_shop: Shop;
  /** A class, ticket, outing or membership rather than a physical thing. */
  is_experience: boolean;
}

/** Something to make. */
export interface DiyIdea {
  title: string;
  reason: string;
  based_on: BasedOn;
  /** Cost of the materials in whole dollars, at most the budget maximum. */
  estimated_cost_usd: number;
  /** Things to buy at a craft or grocery store: "8 oz jar", "chalk paint". */
  materials: string[];
  /** One or two plain sentences on how to make it. */
  how_to: string;
  difficulty: Difficulty;
  time_needed: TimeNeeded;
}

/** The model's whole answer, and what `gift_suggestions.ideas` stores. */
export interface GiftIdeas {
  retail: RetailIdea[];
  diy: DiyIdea[];
  /**
   * "In a nutshell": a few warm sentences that help the Santa get to know the giftee.
   * Optional because rows saved before it existed don't have it.
   */
  nutshell?: string;
}

/** Display limits, checked by the validator (structured outputs cannot enforce lengths or counts). */
export const LIMITS = {
  titleChars: 80,
  reasonChars: 200,
  searchKeywordsChars: 80,
  searchKeywordsWords: { min: 1, max: 8 },
  howToChars: 300,
  materials: { min: 1, max: 12 },
  materialChars: 60,
  nutshellChars: 500,
} as const;

const basedOnSchema = {
  type: "string",
  enum: [...BASED_ON_KEYS],
  description: 'The questionnaire key the reason draws on, or "general" if they left nothing usable.',
} as const;

/**
 * JSON Schema for structured outputs (`output_config: { format: { type: "json_schema", schema } }`).
 * Uses only features structured outputs supports: no min/max, no length or array-size limits.
 * Those are enforced by `validateGiftIdeas`.
 */
export const GIFT_IDEAS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nutshell", "retail", "diy"],
  properties: {
    nutshell: {
      type: "string",
      description: "Two or three warm sentences, under 70 words, that help their Secret Santa get to know them. Refers to them as \"they\".",
    },
    retail: {
      type: "array",
      description: `Exactly ${RETAIL_IDEA_COUNT} things to buy.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "based_on", "estimated_price_usd", "search_keywords", "best_shop", "is_experience"],
        properties: {
          title: { type: "string", description: "Short, specific gift name, under 60 characters." },
          reason: { type: "string", description: "One sentence, under 140 characters, pointing to something they wrote." },
          based_on: basedOnSchema,
          estimated_price_usd: { type: "integer", description: "Realistic US price in whole dollars, inside the budget." },
          search_keywords: { type: "string", description: "3-6 words to type into a store search box." },
          best_shop: { type: "string", enum: [...SHOPS] },
          is_experience: { type: "boolean", description: "True for classes, tickets, outings, memberships." },
        },
      },
    },
    diy: {
      type: "array",
      description: `Exactly ${DIY_IDEA_COUNT} things to make.`,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "based_on", "estimated_cost_usd", "materials", "how_to", "difficulty", "time_needed"],
        properties: {
          title: { type: "string", description: "Short, specific name of the handmade gift, under 60 characters." },
          reason: { type: "string", description: "One sentence, under 140 characters, pointing to something they wrote." },
          based_on: basedOnSchema,
          estimated_cost_usd: { type: "integer", description: "Cost of materials in whole dollars, at most the budget maximum." },
          materials: { type: "array", items: { type: "string" }, description: "Craft or grocery store items, short names." },
          how_to: { type: "string", description: "One or two plain sentences on how to make it." },
          difficulty: { type: "string", enum: [...DIFFICULTIES] },
          time_needed: { type: "string", enum: [...TIMES_NEEDED] },
        },
      },
    },
  },
} as const;
