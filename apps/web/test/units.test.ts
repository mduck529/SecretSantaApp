import { describe, expect, it } from "vitest";
import {
  addedAfterSendMessage,
  explainProblem,
  formatExchangeDate,
  groupBudget,
  normalizeEmail,
  normalizePhone,
  planDeliveryUpdates,
  removedAfterSendMessage,
} from "@/lib/group-service";
import { describeSendError } from "@/lib/email/send";
import {
  announcementEmail,
  emailChangedNotice,
  maskEmail,
  matchEmail,
  profileUpdatedEmail,
  reminderEmail,
} from "@/lib/email/templates";
import { checkReveal, todayInEastern } from "@/lib/reveal";
import { canCreateGroups, deadLinkOutcome, safeNext } from "@/lib/auth";
import {
  isReminderAudience,
  isResendAudience,
  pickReminderTargets,
  pickResendTargets,
  questionnaireState,
  summarize,
  type RecipientInfo,
} from "@/lib/audience";
import { describeAudit } from "@/lib/audit-labels";

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

  it.each([
    "/g/123",
    "/g/123#questionnaire",
    "/g/123?tab=admin&x=1",
    "/home",
    "/",
    "/g/123/admin",
    "/a//b", // a double slash later in the path stays on our site
    "/%5Cevil.com", // percent-encoded backslash: the browser keeps it in the path
    "/%2F%2Fevil.com",
    "/%09/evil.com",
    "/caf%C3%A9",
  ])("keeps the same-site path %j", (path) => {
    expect(safeNext(path)).toBe(path);
    // And the browser would indeed stay on our site.
    expect(new URL(path, "https://santa.example").origin).toBe("https://santa.example");
  });

  it.each([
    // Security review M-1: backslash and whitespace tricks.
    "/\\evil.com",
    "/\\/evil.com",
    "/\\\\evil.com",
    "\\\\evil.com",
    "\\/evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "/\r/evil.com",
    "/\r\n/evil.com",
    "/\t\\evil.com",
    "\t//evil.com",
    " //evil.com",
    "/ /evil.com",
    "//\tevil.com",
    "/\u0000/evil.com",
    "/\u000b/evil.com",
    "/\u000c/evil.com",
    "/\u001f/evil.com",
    "/\u007f/evil.com",
    "/\u0085/evil.com",
    "/\u00a0/evil.com",
    "/\u2028/evil.com",
    "/\u200b/evil.com",
    "/\ufeff/evil.com",
    "/g/1\\..\\..\\evil.com", // a backslash anywhere, not just at the start
    "/g/1\tx",
    // Slashes and schemes.
    "//evil.com",
    "///evil.com",
    "/.//evil.com", // normalizes to //evil.com
    "/..//evil.com",
    "https://evil.com",
    "http:/evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    "/" + "a".repeat(3000),
  ])("rejects %j", (path) => {
    expect(safeNext(path)).toBe("/home");
  });

  it("rejects anything that isn't a string", () => {
    expect(safeNext(undefined)).toBe("/home");
    expect(safeNext(["/g/1", "//evil.com"])).toBe("/home");
    expect(safeNext({ toString: () => "/g/1" })).toBe("/home");
    expect(safeNext(42, "/login")).toBe("/login");
  });

  it("the review's bypasses really did leave the site before the fix", () => {
    // Guards the test cases themselves: if the URL parser stops treating these as off-site,
    // the rejection tests above would no longer be proving anything.
    for (const path of ["/\\evil.com", "/\t/evil.com", "/\n/evil.com", "\t//evil.com"]) {
      expect(new URL(path, "https://santa.example").host).toBe("evil.com");
    }
  });
});

describe("email templates", () => {
  const base = {
    to: "bob@example.com",
    name: "Bob",
    groupName: "Family 2026",
    budget: "$100–$150",
    exchangeDate: "Friday, December 25",
    gifteeHasAnswers: false,
    link: "https://santa.example/auth/confirm?token_hash=x&next=%2Fg%2F1",
  };

  it("invites the person to unwrap their match and links to the questionnaire", () => {
    const e = matchEmail(base);
    expect(e.subject).toBe("🎁 Your Secret Santa match is ready to unwrap");
    expect(e.html).toContain("unwrap");
    expect(e.html).toContain("$100–$150");
    expect(e.html).toContain("fill out your own questionnaire");
    expect(e.html).toContain(base.link.replace(/&/g, "&amp;"));
    expect(e.text).toContain(base.link);
  });

  it("says when the giftee hasn't filled theirs out yet", () => {
    expect(matchEmail(base).text).toContain("hasn't filled out their questionnaire yet");
    expect(matchEmail({ ...base, gifteeHasAnswers: true }).text).toContain("has filled out");
  });

  it("never names the giftee, so the unwrap stays a surprise", () => {
    // The inputs have no giftee field; make sure nothing sneaks one through.
    const sneaky = { ...base, giftee: "Alice" } as Parameters<typeof matchEmail>[0];
    for (const e of [matchEmail(sneaky), matchEmail({ ...sneaky, changed: true }), profileUpdatedEmail({ to: "a@b.c", name: "Bob", link: "https://x" })]) {
      expect(`${e.subject} ${e.html} ${e.text}`).not.toContain("Alice");
    }
  });

  it("uses 'changed' wording for updated matches", () => {
    expect(matchEmail({ ...base, changed: true }).subject).toBe("Your Secret Santa match has changed");
  });

  it("escapes names so they can't inject HTML", () => {
    const e = matchEmail({ ...base, name: `<img src=x onerror=alert(1)>` });
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(profileUpdatedEmail({ to: "a@b.c", name: "<b>", link: "https://x" }).html).not.toMatch(/<b>/);
    expect(reminderEmail({ to: "a@b.c", name: "<b>", groupName: "<i>", link: "https://x" }).html).not.toMatch(/<b>|<i>/);
  });
});

describe("reminder and resend audiences", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-11-20T12:00:00Z");
  const person = (id: string, over: Partial<RecipientInfo> = {}): RecipientInfo => ({
    id,
    display_name: id,
    user_id: "u",
    questionnaire_complete: false,
    questionnaire_updated_at: null,
    last_reminded_at: null,
    match_email_status: "sent",
    ...over,
  });
  const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
  const family = [
    person("done", { questionnaire_complete: true, questionnaire_updated_at: "2026-11-14T00:00:00Z" }),
    person("started", { questionnaire_updated_at: "2026-11-15T00:00:00Z" }),
    person("blank"),
    person("nagged", { last_reminded_at: new Date(now - 2 * 60 * 60 * 1000).toISOString() }),
    person("failed", { user_id: null, match_email_status: "failed" }),
  ];

  it("classifies questionnaire progress", () => {
    expect(family.map(questionnaireState)).toEqual(["done", "started", "not_started", "not_started", "not_started"]);
  });

  it("targets the right people for each reminder audience and skips the recently nagged", () => {
    expect(ids(pickReminderTargets(family, "not_done", { now }).targets)).toEqual(["started", "blank", "failed"]);
    expect(pickReminderTargets(family, "not_done", { now }).skippedRecent).toBe(1);
    expect(ids(pickReminderTargets(family, "not_started", { now }).targets)).toEqual(["blank", "failed"]);
    expect(ids(pickReminderTargets(family, "started", { now }).targets)).toEqual(["started"]);
    expect(ids(pickReminderTargets(family, "not_done", { now, includeRecent: true }).targets)).toEqual(["started", "blank", "nagged", "failed"]);
  });

  it("lets the cooldown expire after a day", () => {
    const old = [person("a", { last_reminded_at: new Date(now - day - 1000).toISOString() })];
    expect(ids(pickReminderTargets(old, "not_done", { now }).targets)).toEqual(["a"]);
  });

  it("picks who to resend the match email to", () => {
    expect(pickResendTargets(family, "everyone")).toHaveLength(5);
    expect(ids(pickResendTargets(family, "not_signed_in"))).toEqual(["failed"]);
    expect(ids(pickResendTargets(family, "undelivered"))).toEqual(["failed"]);
  });

  it("validates audience values from form input", () => {
    expect(isReminderAudience("not_done")).toBe(true);
    expect(isReminderAudience("toString")).toBe(false);
    expect(isResendAudience("everyone")).toBe(true);
    expect(isResendAudience("constructor")).toBe(false);
  });

  it("summarizes the dashboard", () => {
    expect(summarize(family)).toEqual({ total: 5, signedIn: 4, emailed: 4, emailFailed: 1, done: 1, started: 1, notStarted: 3 });
  });
});

describe("activity labels", () => {
  it("reads like English and never needs pairing data", () => {
    expect(describeAudit("sent", { sent: 12, failed: 0 })).toBe("Match emails sent (12 people)");
    expect(describeAudit("resent_bulk", { count: 1 })).toBe("Resent match emails (1 person)");
    expect(describeAudit("announced", { count: 12 })).toBe("Announcement sent (12 people)");
    expect(describeAudit("something_new")).toBe("something new");
  });
});

describe("notification emails", () => {
  it("adds the organizer's note to reminders, escaped, with line breaks", () => {
    const e = reminderEmail({ to: "a@b.c", name: "Bob", groupName: "Fam", link: "https://x", note: "Finish by Sunday!\n<script>alert(1)</script>" });
    expect(e.html).toContain("Finish by Sunday!<br>&lt;script&gt;");
    expect(e.html).not.toContain("<script>");
    expect(e.text).toContain("From the organizer:\nFinish by Sunday!");
    expect(reminderEmail({ to: "a@b.c", name: "Bob", groupName: "Fam", link: "https://x" }).html).not.toContain("From the organizer");
  });

  it("builds announcements without escaping the organizer's meaning, and escapes markup", () => {
    const e = announcementEmail({ to: "a@b.c", name: "<b>Bob</b>", groupName: "Fam", subject: "Moved to <Saturday>", message: "See you\nat 5", link: "https://x" });
    expect(e.subject).toBe("Moved to <Saturday>");
    expect(e.html).toContain("Moved to &lt;Saturday&gt;");
    expect(e.html).toContain("See you<br>at 5");
    expect(e.html).not.toContain("<b>Bob");
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

describe("match-blind delivery bookkeeping (security review M-3)", () => {
  it("never puts a blind person in the organizer-visible lists", () => {
    const plan = planDeliveryUpdates(["new", "santa", "other"], [true, false, true], ["santa", "other"]);
    expect(plan).toEqual({ sent: ["new"], failed: [], blindSent: ["other"], blindFailed: ["santa"] });
  });

  it("treats a missing result as a failure", () => {
    expect(planDeliveryUpdates(["a", "b"], [true], ["b"]).blindFailed).toEqual(["b"]);
  });

  it("is visible as usual when nobody is blind (Send, Resend)", () => {
    expect(planDeliveryUpdates(["a", "b"], [true, false])).toEqual({ sent: ["a"], failed: ["b"], blindSent: [], blindFailed: [] });
  });

  it("words add and remove results without names", () => {
    expect(addedAfterSendMessage("Dave", { newcomerFailed: false, othersFailed: 0 })).toBe(
      "Added Dave and sent them their match. One other person's match changed and they've been emailed.",
    );
    expect(addedAfterSendMessage("Dave", { newcomerFailed: false, othersFailed: 1 })).toContain("we'll try again automatically");
    expect(removedAfterSendMessage("Bob", 2, 0)).toBe("Removed Bob. 2 people got a new match by email.");
    expect(removedAfterSendMessage("Bob", 2, 1)).toBe(
      "Removed Bob. 2 people got a new match. One email didn't go through, so we'll try again automatically.",
    );
    expect(removedAfterSendMessage("Bob", 2, 2)).toContain("2 emails didn't go through");
  });
});

describe("describeSendError", () => {
  it("keeps codes and drops anything that could hold an address", () => {
    const err = Object.assign(new Error("550 <bob@example.com>: Recipient address rejected"), {
      code: "EENVELOPE",
      responseCode: 550,
      command: "RCPT TO",
      response: "550 5.1.1 <bob@example.com>",
      rejected: ["bob@example.com"],
    });
    expect(describeSendError(err)).toBe("code EENVELOPE, SMTP 550, during RCPT TO");
  });

  it("ignores codes that aren't plain codes", () => {
    expect(describeSendError({ code: "bob@example.com", command: "<bob@example.com>" })).toBe("unknown error");
    expect(describeSendError(new Error("bob@example.com"))).toBe("unknown error");
    expect(describeSendError("bob@example.com")).toBe("unknown error");
    expect(describeSendError(null)).toBe("unknown error");
  });
});

describe("checkReveal", () => {
  const sent = { status: "sent", exchange_date: "2026-12-25", revealed_at: null };
  it("opens on the exchange date and after", () => {
    expect(checkReveal(sent, "2026-12-25").ok).toBe(true);
    expect(checkReveal(sent, "2026-12-30").ok).toBe(true);
  });
  it("stays closed before the date and names the day", () => {
    const r = checkReveal(sent, "2026-12-24");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.message).toBe("You can reveal on Fri, Dec 25.");
  });
  it("needs sent matches and a date", () => {
    expect(checkReveal({ ...sent, status: "matched" }, "2027-01-01").ok).toBe(false);
    expect(checkReveal({ ...sent, exchange_date: null }, "2027-01-01").ok).toBe(false);
  });
  it("refuses a second reveal", () => expect(checkReveal({ ...sent, revealed_at: "2026-12-25T10:00:00Z" }, "2026-12-26").ok).toBe(false));
  it("reads today as a calendar date", () => expect(todayInEastern(new Date("2026-12-25T03:00:00Z"))).toBe("2026-12-24"));
});
