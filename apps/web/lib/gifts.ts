import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import {
  GIFT_IDEAS_JSON_SCHEMA,
  GIFT_MODEL,
  GIFT_PROMPT_VERSION,
  GIFT_SYSTEM_PROMPT,
  buildGiftRetryNote,
  buildGiftUserMessage,
  cleanAnswers,
  keepCleanIdeas,
  validateGiftIdeas,
  type Answers,
  type Budget,
  type GiftIdeas,
} from "@santa/core";
import { createAdminClient } from "./supabase/admin";
import { serverEnv } from "./env";

/**
 * Gift idea engine (docs/GIFT-IDEAS.md). The model sees ONLY the giftee's cleaned answers and the
 * group budget: never a name, email, group, or who the Santa is. Logs hold counts and problem
 * codes only, never answers, ideas or names.
 */

export const GIFT_PER_RECEIVER_MS = 30 * 60 * 1000;
export const GIFT_DAILY_CAP = 200;
const MAX_TOKENS = 16000;

export interface CachedGiftRow {
  answers_updated_at: string | null;
  budget_min_cents: number;
  budget_max_cents: number;
  prompt_version: string;
}

export interface GiftSource {
  questionnaireUpdatedAt: string | null;
  budget: Budget;
}

const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));

/** A row is stale when it is missing, the answers or budget changed, or the prompt version moved on. */
export function isGiftRowStale(row: CachedGiftRow | null, src: GiftSource): boolean {
  if (!row) return true;
  return (
    !sameInstant(row.answers_updated_at, src.questionnaireUpdatedAt) ||
    row.budget_min_cents !== src.budget.minCents ||
    row.budget_max_cents !== src.budget.maxCents ||
    row.prompt_version !== GIFT_PROMPT_VERSION
  );
}

/** The minimal slice of the SDK the engine uses, so tests can pass a fake and never hit the API. */
export interface GiftModelClient {
  create(params: Record<string, unknown>): Promise<GiftModelResponse>;
}
export interface GiftModelResponse {
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export function createGiftModelClient(apiKey: string): GiftModelClient {
  const client = new Anthropic({ apiKey });
  return {
    create: (params) =>
      client.beta.messages.create(params as unknown as Anthropic.Beta.MessageCreateParamsNonStreaming) as unknown as Promise<GiftModelResponse>,
  };
}

export interface GenerateResult {
  ideas: GiftIdeas | null;
  /** Problem codes only, for logs. */
  codes: string[];
  attempts: number;
}

function readJson(res: GiftModelResponse): unknown | undefined {
  if (res.stop_reason === "refusal" || res.stop_reason === "max_tokens") return undefined;
  const block = res.content.find((b) => b.type === "text" && typeof b.text === "string");
  if (!block?.text) return undefined;
  try {
    return JSON.parse(block.text);
  } catch {
    return undefined;
  }
}

/** One generation: call, validate, one retry with the problems listed, then keep the clean ideas. */
export async function generateGiftIdeas(
  client: GiftModelClient,
  input: { answers: Answers; budget: Budget },
): Promise<GenerateResult> {
  const answers = cleanAnswers(input.answers);
  const ctx = { budget: input.budget, answers };
  const userMessage = buildGiftUserMessage({ answers, budget: input.budget });
  const base = {
    model: GIFT_MODEL,
    max_tokens: MAX_TOKENS,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: [{ type: "text", text: GIFT_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    output_config: { effort: "medium", format: { type: "json_schema", schema: GIFT_IDEAS_JSON_SCHEMA } },
  };
  const codes: string[] = [];

  const first = await client.create({ ...base, messages: [{ role: "user", content: userMessage }] });
  const firstJson = readJson(first);
  const firstCheck = validateGiftIdeas(firstJson, ctx);
  if (firstJson !== undefined && !firstCheck.problems.length && firstCheck.ideas) {
    return { ideas: firstCheck.ideas, codes, attempts: 1 };
  }
  codes.push(...(firstJson === undefined ? ["no_output"] : firstCheck.problems.map((p) => p.code)));

  const retryNote = buildGiftRetryNote(
    firstJson === undefined ? [{ message: "No valid JSON answer was produced." }] : firstCheck.problems,
  );
  const second = await client.create({
    ...base,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: first.content },
      { role: "user", content: retryNote },
    ],
  });
  const secondJson = readJson(second);
  const secondCheck = validateGiftIdeas(secondJson, ctx);
  if (secondJson !== undefined && !secondCheck.problems.length && secondCheck.ideas) {
    return { ideas: secondCheck.ideas, codes, attempts: 2 };
  }
  codes.push(...(secondJson === undefined ? ["no_output"] : secondCheck.problems.map((p) => p.code)));
  return { ideas: secondJson === undefined ? null : keepCleanIdeas(secondCheck), codes, attempts: 2 };
}

type Db = ReturnType<typeof createAdminClient>;

/**
 * Refreshes stale gift ideas for these giftees (only those in groups that have sent matches).
 * Returns the receiver ids whose ideas were regenerated. Never throws for a model failure:
 * the old row, if any, stays.
 */
export async function refreshGiftIdeas(db: Db, receiverIds: string[], client?: GiftModelClient): Promise<Set<string>> {
  const done = new Set<string>();
  const apiKey = serverEnv.anthropicApiKey();
  const model = client ?? (apiKey ? createGiftModelClient(apiKey) : null);
  if (!model || !receiverIds.length) return done;

  const { data: members, error } = await db
    .from("memberships")
    .select("id, questionnaire_updated_at, groups!inner(status, budget_min_cents, budget_max_cents)")
    .in("id", receiverIds);
  if (error) throw error;
  const { data: cached } = await db.from("gift_suggestions").select("*").in("receiver_id", receiverIds);
  const rows = new Map((cached ?? []).map((r) => [r.receiver_id as string, r]));

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await db.from("gift_generation_log").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
  let used = count ?? 0;

  for (const m of members ?? []) {
    const g = (Array.isArray(m.groups) ? m.groups[0] : m.groups) as
      | { status: string; budget_min_cents: number; budget_max_cents: number }
      | undefined;
    if (!g || g.status !== "sent") continue;
    const id = m.id as string;
    const row = rows.get(id) ?? null;
    const budget: Budget = { minCents: g.budget_min_cents, maxCents: g.budget_max_cents, currency: "USD" };
    const updatedAt = (m.questionnaire_updated_at as string | null) ?? null;
    if (!isGiftRowStale(row, { questionnaireUpdatedAt: updatedAt, budget })) continue;
    if (row && Date.now() - Date.parse(row.created_at as string) < GIFT_PER_RECEIVER_MS) continue;
    if (used >= GIFT_DAILY_CAP) {
      console.warn("gift ideas: daily cap reached");
      break;
    }

    const { data: ans } = await db.from("questionnaire_answers").select("answers").eq("membership_id", id).maybeSingle();
    const started = Date.now();
    used++;
    let result: GenerateResult | null = null;
    try {
      result = await generateGiftIdeas(model, { answers: (ans?.answers as Answers) ?? {}, budget });
    } catch (err) {
      console.error("gift ideas: model call failed", err instanceof Error ? err.name : "error");
    }
    await db.from("gift_generation_log").insert({ ok: !!result?.ideas });
    console.log("gift ideas", { ok: !!result?.ideas, attempts: result?.attempts ?? 0, codes: result?.codes ?? [], ms: Date.now() - started });
    if (!result?.ideas) continue;

    const { error: upsertError } = await db.from("gift_suggestions").upsert({
      receiver_id: id,
      ideas: result.ideas,
      answers_updated_at: updatedAt,
      budget_min_cents: budget.minCents,
      budget_max_cents: budget.maxCents,
      model: GIFT_MODEL,
      prompt_version: GIFT_PROMPT_VERSION,
      created_at: new Date().toISOString(),
    });
    if (upsertError) console.error("gift ideas: save failed", upsertError.code);
    else done.add(id);
  }
  return done;
}
