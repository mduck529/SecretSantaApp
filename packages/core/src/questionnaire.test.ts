import { describe, expect, it } from "vitest";
import { ALL_QUESTIONS, BOTH, BRACKET_SKIP, SQUISHY_STYLES, bracketNext, squishyFavorite, NEITHER, THIS_OR_THAT, cleanAnswers, isComplete, thisOrThatPicks } from "./questionnaire.js";

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


  it("accepts only a squishy style or the skip answer for the showdown", () => {
    expect(cleanAnswers({ squishy_favorite: " Mochi " })).toEqual({ squishy_favorite: "Mochi" });
    expect(cleanAnswers({ squishy_favorite: BRACKET_SKIP })).toEqual({ squishy_favorite: BRACKET_SKIP });
    expect(cleanAnswers({ squishy_favorite: "Squishmallow" })).toEqual({});
    expect(cleanAnswers({ squishy_favorite: "mochi" })).toEqual({});
    expect(cleanAnswers({ squishy_favorite: "" })).toEqual({});
  });

  it("finds the favorite squishy, but not for a skip or a blank", () => {
    expect(squishyFavorite({ squishy_favorite: "Plush" })?.image).toBe("/squishies/plush.svg");
    expect(squishyFavorite({ squishy_favorite: BRACKET_SKIP })).toBeNull();
    expect(squishyFavorite({})).toBeNull();
  });

  it("has six squishy styles with pictures and no brand names", () => {
    expect(SQUISHY_STYLES).toHaveLength(6);
    expect(JSON.stringify(SQUISHY_STYLES)).not.toMatch(/squishmallow/i);
  });
});

describe("bracketNext", () => {
  const E = ["A", "B", "C", "D", "E", "F"];

  it("starts with 1 v 2", () => {
    expect(bracketNext(E, [])).toEqual({ kind: "match", number: 1, of: 5, round: "Round 1", a: "A", b: "B" });
  });

  it("plays 3 first-round matches", () => {
    expect(bracketNext(E, ["B"])).toMatchObject({ number: 2, a: "C", b: "D", round: "Round 1" });
    expect(bracketNext(E, ["B", "C"])).toMatchObject({ number: 3, a: "E", b: "F", round: "Round 1" });
  });

  it("round 2 is winner 1 v winner 2, with winner 3 waiting on a bye", () => {
    expect(bracketNext(E, ["B", "C", "F"])).toEqual({ kind: "match", number: 4, of: 5, round: "Round 2", a: "B", b: "C", waiting: "F" });
  });

  it("the final is the round 2 winner v winner 3", () => {
    expect(bracketNext(E, ["B", "C", "F", "C"])).toEqual({ kind: "match", number: 5, of: 5, round: "Final", a: "C", b: "F" });
  });

  it("ends with the final's winner after 5 picks", () => {
    expect(bracketNext(E, ["B", "C", "F", "C", "F"])).toEqual({ kind: "winner", winner: "F" });
    expect(bracketNext(E, ["A", "D", "E", "A", "A"])).toEqual({ kind: "winner", winner: "A" });
  });

  it("every path has exactly 5 taps and crowns one of the entrants", () => {
    for (let mask = 0; mask < 32; mask++) {
      const picks: string[] = [];
      let step = bracketNext(E, picks);
      let taps = 0;
      while (step.kind === "match") {
        picks.push(mask & (1 << taps) ? step.b : step.a);
        taps++;
        step = bracketNext(E, picks);
      }
      expect(taps).toBe(5);
      expect(E).toContain(step.winner);
    }
  });

  it("ignores a pick that isn't in the current match, and anything after it", () => {
    expect(bracketNext(E, ["Z"])).toMatchObject({ number: 1 });
    expect(bracketNext(E, ["A", "E"])).toMatchObject({ number: 2, a: "C", b: "D" });
    expect(bracketNext(E, ["A", "C", "E", "B"])).toMatchObject({ number: 4 });
  });

  it("needs exactly 6 entrants", () => {
    expect(() => bracketNext(["A", "B"], [])).toThrow();
  });
});
