import { describe, expect, it } from "vitest";
import { explainProblem, formatExchangeDate, groupBudget, normalizeEmail, normalizePhone } from "@/lib/group-service";
import { emailChangedNotice, maskEmail, matchEmail, profileUpdatedEmail, reminderEmail } from "@/lib/email/templates";
import { canCreateGroups, deadLinkOutcome, safeNext } from "@/lib/auth";

describe("normalizePhone", () => {
  it.each([
    ["(555) 123-4567", "+15551234567"],
    ["555.123.4567", "+15551234567"],
    ["1-555-123-4567", "+15551234567"],
    ["+44 20 7946 0958", "+442079460958"],
    ["", null],
    ["   ", null],
  ])("%s -> %s", (input, expected) => expect(normalizePhone(input)).toBe(expected));

  it("rejects nonsense", () => {
    expect(() => normalizePhone("12345")).toThrow();
    expect(() => normalizePhone("+0123")).toThrow();
  });
});

describe("normalizeEmail", () => {
  it("lowercases and trims", () => expect(normalizeEmail("  Aunt.Sue@Example.COM ")).toBe("aunt.sue@example.com"));
  it("rejects bad addresses", () => {
    expect(() => normalizeEmail("sue")).toThrow();
    expect(() => normalizeEmail("sue@example")).toThrow();
  });
});

describe("formatting", () => {
  it("shows the default family budget", () => {
    expect(groupBudget({ budget_min_cents: 10000, budget_max_cents: 15000 })).toBe("$100–$150");
  });
  it("formats the exchange date without timezone drift", () => {
    expect(formatExchangeDate("2026-12-25")).toBe("Friday, December 25");
    expect(formatExchangeDate(null)).toBeNull();
  });
});

describe("explainProblem", () => {
  const names: Record<string, string> = { a: "Alice", b: "Bob", c: "Carol" };
  it("names the people the rules box in", () => {
    expect(
      explainProblem({ kind: "rules_too_strict", givers: ["a", "b"], canOnlyDraw: ["c"] }, (id) => names[id]!),
    ).toBe("The rules leave Alice, Bob able to draw only Carol, so someone would be left out. Remove one of their rules.");
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/g/123")).toBe("/g/123");
    expect(safeNext("//evil.example")).toBe("/home");
    expect(safeNext("https://evil.example")).toBe("/home");
    expect(safeNext(null)).toBe("/home");
  });
});

describe("email templates", () => {
  const base = {
    to: "bob@example.com",
    name: "Bob",
    giftee: "Alice",
    groupName: "Family 2026",
    budget: "$100–$150",
    exchangeDate: "Friday, December 25",
    gifteeHasAnswers: false,
    link: "https://santa.example/auth/confirm?token_hash=x&next=%2Fg%2F1",
  };

  it("tells the person who they're buying for and links to the questionnaire", () => {
    const e = matchEmail(base);
    expect(e.subject).toContain("Alice");
    expect(e.html).toContain("Alice");
    expect(e.html).toContain("$100–$150");
    expect(e.html).toContain("fill out your own questionnaire");
    expect(e.html).toContain(base.link.replace(/&/g, "&amp;"));
    expect(e.text).toContain(base.link);
  });

  it("says when the giftee hasn't filled theirs out yet", () => {
    expect(matchEmail(base).text).toContain("hasn't filled out their questionnaire yet");
    expect(matchEmail({ ...base, gifteeHasAnswers: true }).text).toContain("has filled out");
  });

  it("uses 'changed' wording for updated matches", () => {
    expect(matchEmail({ ...base, changed: true }).subject).toBe("Your Secret Santa match has changed");
  });

  it("escapes names so they can't inject HTML", () => {
    const e = matchEmail({ ...base, giftee: `<img src=x onerror=alert(1)>`, name: `"Bob"` });
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(profileUpdatedEmail({ to: "a@b.c", name: "<b>", giftee: "<i>", link: "https://x" }).html).not.toMatch(/<b>|<i>/);
    expect(reminderEmail({ to: "a@b.c", name: "<b>", groupName: "<i>", link: "https://x" }).html).not.toMatch(/<b>|<i>/);
  });
});

describe("emailChangedNotice", () => {
  const e = emailChangedNotice({ to: "old@example.com", name: "<b>Sue", groupName: "Family <2026>", newEmail: "someone.new@example.com" });
  it("goes to the old address, masks the new one, and carries no link", () => {
    expect(e.to).toBe("old@example.com");
    expect(e.html).toContain("s•••@example.com");
    expect(e.html + e.text).not.toContain("someone.new");
    expect(e.html).not.toContain("<a ");
    expect(e.html).not.toMatch(/<b>Sue|<2026>/);
  });
  it("masks odd addresses safely", () => {
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
    expect(maskEmail("nonsense")).toBe("•••");
  });
});

describe("deadLinkOutcome", () => {
  it("lets a signed-in person through on their own old link", () => {
    expect(deadLinkOutcome("sue@example.com", "Sue@Example.com ")).toBe("go");
    expect(deadLinkOutcome("sue@example.com", "")).toBe("go");
  });
  it("never lets one person through on another person's link, or anyone signed out", () => {
    expect(deadLinkOutcome("sue@example.com", "bob@example.com")).toBe("expired");
    expect(deadLinkOutcome(null, "sue@example.com")).toBe("expired");
    expect(deadLinkOutcome(undefined, "")).toBe("expired");
  });
});

describe("canCreateGroups", () => {
  it("allows only listed emails", () => {
    expect(canCreateGroups("Me@Example.com", "me@example.com, other@example.com", true)).toBe(true);
    expect(canCreateGroups("stranger@example.com", "me@example.com", true)).toBe(false);
    expect(canCreateGroups(null, "me@example.com", true)).toBe(false);
  });
  it("with no list: nobody in production, anyone in development", () => {
    expect(canCreateGroups("me@example.com", "", true)).toBe(false);
    expect(canCreateGroups("me@example.com", undefined, false)).toBe(true);
  });
});
