import { describe, expect, it } from "vitest";
import { GIFT_MODEL, GIFT_PROMPT_VERSION } from "@santa/core";
import { generateGiftIdeas, isGiftRowStale, type GiftModelClient, type GiftModelResponse } from "@/lib/gifts";
import { shopLinks } from "@/lib/shop-links";
import { profileUpdatedEmail } from "@/lib/email/templates";

const budget = { minCents: 100_00, maxCents: 150_00, currency: "USD" as const };
const answers = { hobbies: "Fly fishing", please_no: "Mugs" };

const good = {
  retail: [
    { title: "Fly-tying kit", reason: "They tie their own flies.", based_on: "hobbies", estimated_price_usd: 120, search_keywords: "fly tying kit", best_shop: "amazon", is_experience: false },
    { title: "Fishing waders", reason: "They fish in all weather.", based_on: "hobbies", estimated_price_usd: 140, search_keywords: "fishing waders", best_shop: "target", is_experience: false },
    { title: "Tackle organizer set", reason: "They love fly fishing gear.", based_on: "hobbies", estimated_price_usd: 110, search_keywords: "tackle organizer", best_shop: "any", is_experience: false },
  ],
  diy: [
    { title: "Hand-tied fly box", reason: "They tie flies.", based_on: "hobbies", estimated_cost_usd: 20, materials: ["wood box"], how_to: "Sand and stain the box.", difficulty: "easy", time_needed: "a_few_hours" },
    { title: "Fishing print", reason: "They love fishing.", based_on: "hobbies", estimated_cost_usd: 15, materials: ["frame", "print"], how_to: "Frame a map of their favorite lake.", difficulty: "easy", time_needed: "under_1_hour" },
  ],
};
const bad = { ...good, retail: [{ ...good.retail[0]!, estimated_price_usd: 900 }, ...good.retail.slice(1)] };
const reply = (body: unknown): GiftModelResponse => ({ stop_reason: "end_turn", content: [{ type: "thinking" }, { type: "text", text: JSON.stringify(body) }] });

function fake(...replies: GiftModelResponse[]) {
  const calls: Record<string, unknown>[] = [];
  const client: GiftModelClient = { create: async (p) => (calls.push(p), replies[calls.length - 1]!) };
  return { client, calls };
}

describe("generateGiftIdeas", () => {
  it("accepts a valid first answer and sends only answers and budget", async () => {
    const { client, calls } = fake(reply(good));
    const r = await generateGiftIdeas(client, { answers, budget });
    expect(r.ideas?.retail).toHaveLength(3);
    expect(r.attempts).toBe(1);
    const sent = JSON.stringify(calls[0]);
    expect(calls[0]).toMatchObject({ model: GIFT_MODEL, fallbacks: "default" });
    expect(sent).not.toMatch(/@|santa_name|display_name/i);
  });

  it("retries once with the problems listed, then accepts", async () => {
    const { client, calls } = fake(reply(bad), reply(good));
    const r = await generateGiftIdeas(client, { answers, budget });
    expect(r.attempts).toBe(2);
    expect(r.codes).toContain("budget");
    expect(r.ideas?.retail).toHaveLength(3);
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1])).toContain("broke these rules");
  });

  it("keeps only the clean ideas when the retry also fails", async () => {
    const { client } = fake(reply(bad), reply(bad));
    const r = await generateGiftIdeas(client, { answers, budget });
    expect(r.ideas?.retail).toHaveLength(2);
    expect(r.ideas?.diy).toHaveLength(2);
  });

  it("returns nothing on refusals or junk, without throwing", async () => {
    const refusal: GiftModelResponse = { stop_reason: "refusal", content: [] };
    const { client } = fake(refusal, { stop_reason: "end_turn", content: [{ type: "text", text: "nope" }] });
    const r = await generateGiftIdeas(client, { answers, budget });
    expect(r.ideas).toBeNull();
    expect(r.codes).toEqual(["no_output", "no_output"]);
  });
});

describe("isGiftRowStale", () => {
  const row = { answers_updated_at: "2026-11-15T10:00:00Z", budget_min_cents: 100_00, budget_max_cents: 150_00, prompt_version: GIFT_PROMPT_VERSION };
  const src = { questionnaireUpdatedAt: "2026-11-15T10:00:00+00:00", budget };
  it("is fresh when nothing changed (same instant, different format)", () => expect(isGiftRowStale(row, src)).toBe(false));
  it("is stale with no row", () => expect(isGiftRowStale(null, src)).toBe(true));
  it("is stale when answers change", () => expect(isGiftRowStale(row, { ...src, questionnaireUpdatedAt: "2026-11-15T11:00:00Z" })).toBe(true));
  it("is stale when the budget changes", () => expect(isGiftRowStale(row, { ...src, budget: { ...budget, maxCents: 200_00 } })).toBe(true));
  it("is stale when the prompt version changes", () => expect(isGiftRowStale({ ...row, prompt_version: "old" }, src)).toBe(true));
  it("treats an empty profile (null) as matching null", () => expect(isGiftRowStale({ ...row, answers_updated_at: null }, { ...src, questionnaireUpdatedAt: null })).toBe(false));
});

describe("shopLinks", () => {
  it("URL-encodes keywords and puts the best shop first", () => {
    const links = shopLinks("fly tying & kit", "etsy");
    expect(links.map((l) => l.label)).toEqual(["Etsy", "Amazon", "Target"]);
    expect(links[0]!.href).toBe("https://www.etsy.com/search?q=fly%20tying%20%26%20kit");
    expect(links[1]!.href).toBe("https://www.amazon.com/s?k=fly%20tying%20%26%20kit");
    expect(links[2]!.href).toBe("https://www.target.com/s?searchTerm=fly%20tying%20%26%20kit");
  });
});

describe("profileUpdatedEmail", () => {
  const base = { to: "a@x.com", name: "A", giftee: "B", link: "https://x" };
  it("mentions new gift ideas only when regenerated", () => {
    expect(profileUpdatedEmail({ ...base, newIdeas: true }).text).toContain("New gift ideas are ready");
    expect(profileUpdatedEmail(base).text).not.toContain("gift ideas");
  });
});
