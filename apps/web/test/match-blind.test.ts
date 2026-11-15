/**
 * Security review M-3: when the "your match has changed" email after an add or remove fails,
 * nothing the organizer (or any member) can see may say who it was for: not the result message,
 * not the "Email failed" badge (match_email_status), not the server log.
 *
 * These tests run the real organizer actions against a small in-memory stand-in for Supabase
 * and a fake SMTP server that rejects one address.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// In-memory Supabase (only what group-service.ts uses)
// ---------------------------------------------------------------------------

type Row = Record<string, any>;
const tables: Record<string, Row[]> = {};

function reset() {
  for (const t of ["groups", "memberships", "assignments", "exclusion_rules", "audit_log", "profile_notifications", "member_contacts"]) {
    tables[t] = [];
  }
}

class Query implements PromiseLike<{ data: any; error: any }> {
  private filters: ((r: Row) => boolean)[] = [];
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private values: any;
  private returning = false;
  private one: "single" | "maybe" | null = null;

  constructor(private table: string) {}

  select() {
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    return this;
  }
  insert(values: any) {
    this.op = "insert";
    this.values = values;
    return this;
  }
  update(values: any) {
    this.op = "update";
    this.values = values;
    return this;
  }
  upsert(values: any) {
    this.op = "upsert";
    this.values = values;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  private get(r: Row, col: string) {
    if (col === "groups.status") return tables.groups!.find((g) => g.id === r.group_id)?.status;
    return r[col];
  }
  eq(col: string, v: any) {
    this.filters.push((r) => this.get(r, col) === v);
    return this;
  }
  in(col: string, vs: any[]) {
    this.filters.push((r) => vs.includes(this.get(r, col)));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  or() {
    this.filters.push(() => false);
    return this;
  }
  single() {
    this.one = "single";
    return this;
  }
  maybeSingle() {
    this.one = "maybe";
    return this;
  }
  private run(): { data: any; error: any } {
    const rows = tables[this.table]!;
    const match = (r: Row) => this.filters.every((f) => f(r));
    let out: Row[] = [];
    switch (this.op) {
      case "select":
        out = rows.filter(match);
        break;
      case "insert": {
        const list = (Array.isArray(this.values) ? this.values : [this.values]).map((v: Row) => ({
          id: crypto.randomUUID(),
          match_email_status: "not_sent",
          match_email_sent_at: null,
          match_email_retry: false,
          questionnaire_updated_at: null,
          role: "member",
          ...v,
        }));
        if (this.table === "memberships" && list.some((v: Row) => rows.some((r) => r.group_id === v.group_id && r.email === v.email))) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        rows.push(...list);
        out = list;
        break;
      }
      case "update":
        out = rows.filter(match);
        for (const r of out) Object.assign(r, this.values);
        break;
      case "upsert":
        for (const v of Array.isArray(this.values) ? this.values : [this.values]) {
          const key = "membership_id" in v ? "membership_id" : "id";
          const existing = rows.find((r) => r[key] === v[key]);
          if (existing) Object.assign(existing, v);
          else rows.push({ ...v });
        }
        break;
      case "delete":
        tables[this.table] = rows.filter((r) => !match(r));
        break;
    }
    const data = this.op === "select" || this.returning ? out.map((r) => ({ ...r })) : null;
    if (this.one) {
      if (!data?.length) return { data: null, error: this.one === "single" ? { code: "PGRST116", message: "no rows" } : null };
      return { data: data[0], error: null };
    }
    return { data, error: null };
  }
  then<A, B>(ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

const fakeDb = {
  from: (table: string) => new Query(table),
  rpc: async (fn: string, args: any) => {
    if (fn !== "save_assignments") throw new Error(`unexpected rpc ${fn}`);
    tables.assignments = args.pairs.map((p: any) => ({ group_id: args.gid, giver_id: p.giver, receiver_id: p.receiver }));
    if (args.remove_member) tables.memberships = tables.memberships!.filter((m) => m.id !== args.remove_member);
    tables.audit_log!.push({ group_id: args.gid, action: args.action, details: { participants: args.pairs.length } });
    return { data: args.pairs.length, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeDb }));
vi.mock("@/lib/links", () => ({
  signInLink: async (email: string, next: string) => `https://santa.example/auth/confirm?email=${encodeURIComponent(email)}&next=${next}`,
}));

// A fake SMTP server that rejects some addresses the way Gmail does: the error quotes the address.
const rejected = new Set<string>();
const delivered: string[] = [];
vi.mock("nodemailer", () => ({
  default: {
    createTransport: () => ({
      sendMail: async ({ to }: { to: string }) => {
        if (rejected.has(to)) {
          throw Object.assign(new Error(`Can't send mail - all recipients were rejected: 550 5.1.1 <${to}>: Recipient address rejected`), {
            code: "EENVELOPE",
            responseCode: 550,
            command: "RCPT TO",
            response: `550 5.1.1 <${to}>: Recipient address rejected`,
            rejected: [to],
          });
        }
        delivered.push(to);
        return {};
      },
      close: () => {},
    }),
  },
}));

const { addMember, removeMember, resendMatch, retryChangedMatchEmails } = await import("@/lib/group-service");

// ---------------------------------------------------------------------------
// Fixtures: a sent group of four in one loop, org -> alice -> bob -> carol -> org
// ---------------------------------------------------------------------------

const GID = "11111111-1111-4111-8111-111111111111";
const ORG_USER = "22222222-2222-4222-8222-222222222222";
const ids = { org: "", alice: "", bob: "", carol: "" };
let logged: string[] = [];

function member(name: keyof typeof ids, role = "member") {
  const id = crypto.randomUUID();
  ids[name] = id;
  return {
    id,
    group_id: GID,
    display_name: name[0]!.toUpperCase() + name.slice(1),
    email: `${name}@example.com`,
    user_id: role === "organizer" ? ORG_USER : null,
    role,
    match_email_status: "sent",
    match_email_sent_at: "2026-11-13T12:00:00.000Z",
    match_email_retry: false,
    questionnaire_updated_at: null,
  };
}

function statusOf(name: keyof typeof ids) {
  return tables.memberships!.find((m) => m.id === ids[name]);
}

/** The organizer's result message, the audit log and the server log, as one string. */
function visibleText(message: string) {
  return [message, JSON.stringify(tables.audit_log), ...logged].join("\n");
}

beforeEach(() => {
  reset();
  rejected.clear();
  delivered.length = 0;
  logged = [];
  vi.stubEnv("SMTP_USER", "santa@example.com");
  vi.stubEnv("SMTP_PASS", "test-pass");
  vi.stubEnv("APP_URL", "https://santa.example");
  for (const level of ["error", "warn", "info", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => (a instanceof Error ? `${a.message} ${JSON.stringify(a)}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
  tables.groups!.push({ id: GID, name: "Family 2026", status: "sent", budget_min_cents: 10000, budget_max_cents: 15000, exchange_date: null });
  tables.memberships!.push(member("org", "organizer"), member("alice"), member("bob"), member("carol"));
  const loop: [keyof typeof ids, keyof typeof ids][] = [
    ["org", "alice"],
    ["alice", "bob"],
    ["bob", "carol"],
    ["carol", "org"],
  ];
  tables.assignments = loop.map(([g, r]) => ({ group_id: GID, giver_id: ids[g], receiver_id: ids[r] }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------

describe("removing someone after Send when the follow-up email fails (M-3)", () => {
  it("doesn't name, badge or log the person whose match changed", async () => {
    // Alice was buying for Bob. Removing Bob gives Alice a new match; her email fails.
    rejected.add("alice@example.com");
    const result = await removeMember(GID, ORG_USER, ids.bob);

    expect(result.ok).toBe(true);
    expect(result.message).toBe("Removed Bob. One person got a new match. One email didn't go through, so we'll try again automatically.");
    const seen = visibleText(result.message);
    expect(seen).not.toMatch(/alice/i);
    expect(statusOf("alice")!.match_email_status).toBe("sent"); // badge unchanged, not "Email failed"
    expect(statusOf("alice")!.match_email_retry).toBe(true); // server-only retry flag
    expect(statusOf("alice")!.match_email_sent_at).toBe("2026-11-13T12:00:00.000Z");
    expect(logged.join("\n")).toContain("An email failed to send (code EENVELOPE, SMTP 550, during RCPT TO)");
  });

  it("updates only server-only columns when the follow-up succeeds", async () => {
    // Alice's status was "failed" from the first Send. Flipping it to "sent" now would show the
    // organizer that Alice was the removed person's Santa.
    statusOf("alice")!.match_email_status = "failed";
    const result = await removeMember(GID, ORG_USER, ids.bob);

    expect(result.message).toBe("Removed Bob. One person got a new match by email.");
    expect(delivered).toEqual(["alice@example.com"]);
    expect(statusOf("alice")!.match_email_status).toBe("failed");
    expect(statusOf("alice")!.match_email_sent_at).not.toBe("2026-11-13T12:00:00.000Z");
    expect(statusOf("alice")!.match_email_retry).toBe(false);
  });
});

describe("adding someone after Send when the follow-up email fails (M-3)", () => {
  it("names only the newcomer, never their Santa", async () => {
    // Whoever's match changes is the newcomer's Santa. Make every existing person's email fail,
    // so whoever it is, their email fails.
    for (const n of ["org", "alice", "bob", "carol"]) rejected.add(`${n}@example.com`);
    const result = await addMember(GID, ORG_USER, { name: "Dave", email: "dave@example.com", phone: "" });

    expect(result.ok).toBe(true);
    expect(result.message).toBe(
      "Added Dave and sent them their match. One other person's match changed. That email didn't go through, so we'll try again automatically.",
    );
    const seen = visibleText(result.message);
    for (const n of ["org", "alice", "bob", "carol"]) expect(seen).not.toMatch(new RegExp(`${n}@`, "i"));
    expect(tables.memberships!.filter((m) => m.match_email_status === "failed")).toEqual([]);
    expect(tables.memberships!.filter((m) => m.match_email_retry).length).toBe(1);
    const dave = tables.memberships!.find((m) => m.email === "dave@example.com")!;
    expect(dave.match_email_status).toBe("sent");
  });

  it("still tells the organizer when the newcomer's own email fails (they just typed it)", async () => {
    rejected.add("dave@example.com");
    const result = await addMember(GID, ORG_USER, { name: "Dave", email: "dave@example.com", phone: "" });

    expect(result.message).toBe(
      `Added Dave, but we couldn't email them their match. Check their address and press "Resend match email". One other person's match changed and they've been emailed.`,
    );
    expect(tables.memberships!.find((m) => m.email === "dave@example.com")!.match_email_status).toBe("failed");
    expect(logged.join("\n")).not.toContain("dave@example.com");
  });
});

describe("the daily retry", () => {
  it("resends a failed follow-up without touching what the organizer sees", async () => {
    rejected.add("alice@example.com");
    await removeMember(GID, ORG_USER, ids.bob);
    rejected.clear();
    logged = [];

    expect(await retryChangedMatchEmails()).toEqual({ sent: 1, failed: 0 });
    expect(delivered).toEqual(["alice@example.com"]);
    expect(statusOf("alice")!.match_email_retry).toBe(false);
    expect(statusOf("alice")!.match_email_status).toBe("sent");
    expect(logged.join("\n")).not.toMatch(/alice/i);
    expect(await retryChangedMatchEmails()).toEqual({ sent: 0, failed: 0 });
  });

  it("keeps trying while it fails, and stops once the group is re-matched", async () => {
    rejected.add("alice@example.com");
    await removeMember(GID, ORG_USER, ids.bob);
    expect(await retryChangedMatchEmails()).toEqual({ sent: 0, failed: 1 });
    expect(statusOf("alice")!.match_email_retry).toBe(true);
    expect(statusOf("alice")!.match_email_status).toBe("sent");

    tables.groups![0]!.status = "matched";
    expect(await retryChangedMatchEmails()).toEqual({ sent: 0, failed: 0 });
  });

  it("is cleared by an organizer's Resend", async () => {
    rejected.add("alice@example.com");
    await removeMember(GID, ORG_USER, ids.bob);
    rejected.clear();
    const result = await resendMatch(GID, ORG_USER, ids.alice);
    expect(result).toEqual({ ok: true, message: "Sent to Alice ✓" });
    expect(statusOf("alice")!.match_email_retry).toBe(false);
  });
});
