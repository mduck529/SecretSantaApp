import { describe, expect, it } from "vitest";
import { ALL_QUESTIONS, BOTH, NEITHER, THIS_OR_THAT, cleanAnswers, isComplete, thisOrThatPicks, wishlistLinks } from "./questionnaire.js";

describe("questionnaire", () => {
  it("has unique keys", () => {
    const keys = ALL_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps known answers, trims, drops unknown keys and invalid choices", () => {
    expect(
      cleanAnswers({ hobbies: "  fishing ", shirt_size: "M", coffee_tea: "Maybe?", evil: "x", loves: "   ", pants_size: 32 }),
    ).toEqual({ hobbies: "fishing", shirt_size: "M" });
  });

  it("caps long answers", () => {
    expect(cleanAnswers({ allergies: "x".repeat(5000) }).allergies).toHaveLength(300);
  });

  it("is complete only when required questions are answered", () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete({ hobbies: "a", loves: "b" })).toBe(false);
    expect(isComplete({ hobbies: "a", loves: "b", please_no: "c" })).toBe(true);
  });

  it("accepts either option, Both! or Neither for this-or-that questions", () => {
    expect(THIS_OR_THAT.length).toBeGreaterThanOrEqual(10);
    expect(cleanAnswers({ coffee_tea: "Tea", sweet_salty: BOTH, beach_mountains: NEITHER, books_movies: "tea" })).toEqual({
      coffee_tea: "Tea",
      sweet_salty: BOTH,
      beach_mountains: NEITHER,
    });
    expect(THIS_OR_THAT.some((q) => q.key === "real_fake_tree")).toBe(true);
  });

  it("lists this-or-that picks with their emoji, skipping Neither", () => {
    expect(thisOrThatPicks({ coffee_tea: "Tea", sweet_salty: BOTH, beach_mountains: NEITHER })).toEqual([
      { key: "coffee_tea", label: "Tea", emoji: "🍵" },
      { key: "sweet_salty", label: "Sweet and salty", emoji: "🍫🥨" },
    ]);
  });

  it("extracts only http(s) wish list links", () => {
    expect(
      wishlistLinks({ wishlist: "https://example.com/a\njavascript:alert(1)\n  http://shop.test/b?x=1 notalink" }),
    ).toEqual(["https://example.com/a", "http://shop.test/b?x=1"]);
  });
});
