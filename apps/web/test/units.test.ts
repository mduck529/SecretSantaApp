import { describe, expect, it } from "vitest";
import { explainProblem, formatExchangeDate, groupBudget, normalizeEmail, normalizePhone } from "@/lib/group-service";
import { announcementEmail, matchEmail, profileUpdatedEmail, reminderEmail } from "@/lib/email/templates";
import {
  isAutoReminderDue,
  isReminderAudience,
  isResendAudience,
  pickReminderTargets,
  pickResendTargets,
  questionnaireState,
  summarize,
  type RecipientInfo,
} from "@/lib/audience";
import { describeAudit } from "@/lib/audit-labels";
import { timeAgo } from "@/lib/time-ago";
import { safeNext } from "@/lib/auth";

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
    auto_reminder_count: 0,
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

  describe("automatic reminders", () => {
    const sentAt = new Date(now - 3 * day).toISOString();
    const group = { auto_remind: true, status: "sent", sent_at: sentAt, exchange_date: "2026-12-25" };
    it("waits two days after Send, then reminds", () => {
      expect(isAutoReminderDue(group, person("a"), now)).toBe(true);
      expect(isAutoReminderDue({ ...group, sent_at: new Date(now - day).toISOString() }, person("a"), now)).toBe(false);
    });
    it("is off unless the organizer turned it on and matches were sent", () => {
      expect(isAutoReminderDue({ ...group, auto_remind: false }, person("a"), now)).toBe(false);
      expect(isAutoReminderDue({ ...group, status: "matched" }, person("a"), now)).toBe(false);
    });
    it("leaves finished people alone", () => {
      expect(isAutoReminderDue(group, person("a", { questionnaire_complete: true }), now)).toBe(false);
    });
    it("spaces reminders three days apart, including manual ones, and stops after three", () => {
      expect(isAutoReminderDue(group, person("a", { last_reminded_at: new Date(now - day).toISOString() }), now)).toBe(false);
      expect(isAutoReminderDue(group, person("a", { last_reminded_at: new Date(now - 3 * day).toISOString() }), now)).toBe(true);
      expect(isAutoReminderDue(group, person("a", { auto_reminder_count: 3 }), now)).toBe(false);
    });
    it("stops after the exchange date", () => {
      expect(isAutoReminderDue({ ...group, exchange_date: "2026-11-19" }, person("a"), now)).toBe(false);
      expect(isAutoReminderDue({ ...group, exchange_date: "2026-11-20" }, person("a"), now)).toBe(true);
    });
  });

  it("summarizes the dashboard", () => {
    expect(summarize(family)).toEqual({ total: 5, signedIn: 4, emailed: 4, emailFailed: 1, done: 1, started: 1, notStarted: 3 });
  });
});

describe("activity labels", () => {
  it("reads like English and never needs pairing data", () => {
    expect(describeAudit("sent", { sent: 12, failed: 0 })).toBe("Match emails sent (12 people)");
    expect(describeAudit("resent_bulk", { count: 1 })).toBe("Resent match emails (1 person)");
    expect(describeAudit("auto_remind_changed", { enabled: true })).toBe("Automatic reminders turned on");
    expect(describeAudit("something_new")).toBe("something new");
  });
});

describe("timeAgo", () => {
  const now = Date.parse("2026-11-20T12:00:00Z");
  it.each([
    ["2026-11-20T11:59:30Z", "just now"],
    ["2026-11-20T11:15:00Z", "45 min ago"],
    ["2026-11-20T07:00:00Z", "5 h ago"],
    ["2026-11-19T11:00:00Z", "1 day ago"],
    ["2026-11-15T12:00:00Z", "5 days ago"],
  ])("%s -> %s", (iso, expected) => expect(timeAgo(iso, now)).toBe(expected));
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
