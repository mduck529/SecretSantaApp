import { describe, expect, it } from "vitest";
import { ALL_QUESTIONS, cleanAnswers, isComplete, wishlistLinks } from "./questionnaire.js";

describe("questionnaire", () => {
  it("has unique keys", () => {
    const keys = ALL_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps known answers, trims, drops unknown keys and invalid choices", () => {
    expect(
      cleanAnswers({ hobbies: "  fishing ", shirt_size: "M", experiences: "Maybe?", evil: "x", loves: "   ", pants_size: 32 }),
    ).toEqual({ hobbies: "fishing", shirt_size: "M" });
  });

  it("caps long answers", () => {
    expect(cleanAnswers({ favorite_colors: "x".repeat(5000) }).favorite_colors).toHaveLength(200);
  });

  it("is complete only when required questions are answered", () => {
    expect(isComplete({})).toBe(false);
    expect(isComplete({ hobbies: "a", loves: "b" })).toBe(false);
    expect(isComplete({ hobbies: "a", loves: "b", please_no: "c" })).toBe(true);
  });

  it("extracts only http(s) wish list links", () => {
    expect(
      wishlistLinks({ wishlist: "https://example.com/a\njavascript:alert(1)\n  http://shop.test/b?x=1 notalink" }),
    ).toEqual(["https://example.com/a", "http://shop.test/b?x=1"]);
  });
});
