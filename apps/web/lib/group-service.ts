import "server-only";
import {
  addParticipant,
  draw,
  formatBudget,
  removeParticipant,
  rulesToExclusions,
  validateAssignments,
  type Assignment,
  type DrawProblem,
  type Exclusion,
} from "@santa/core";
import { createAdminClient } from "./supabase/admin";
import { signInLink } from "./links";
import { sendEmails, type OutgoingEmail } from "./email/send";
import { emailChangedNotice, matchEmail, profileUpdatedEmail, reminderEmail } from "./email/templates";

/**
 * Organizer actions. This module reads matches with the service role so it can
 * draw, repair and email them, but EVERY function returns only counts and
 * plain messages. Nothing here may return or log who has whom: the organizer
 * is a participant too.
 *
 * Callers pass `actorUserId` from the verified session; each function re-checks
 * that this user is an organizer of the group.
 */

export type Outcome = { ok: boolean; message: string };

type Db = ReturnType<typeof createAdminClient>;

interface Group {
  id: string;
  name: string;
  status: "draft" | "matched" | "sent";
  budget_min_cents: number;
  budget_max_cents: number;
  exchange_date: string | null;
}

interface Member {
  id: string;
  display_name: string;
  email: string;
  role: string;
  questionnaire_updated_at: string | null;
  match_email_sent_at: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROFILE_NOTIFY_THROTTLE_MS = 30 * 60 * 1000;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

async function assertAdmin(db: Db, groupId: string, actorUserId: string) {
  const { data } = await db
    .from("memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", actorUserId)
    .in("role", ["organizer", "co_organizer"])
    .maybeSingle();
  if (!data) throw new Error("Not an organizer of this group");
}

async function loadGroup(db: Db, groupId: string): Promise<Group> {
  const { data, error } = await db
    .from("groups")
    .select("id, name, status, budget_min_cents, budget_max_cents, exchange_date")
    .eq("id", groupId)
    .single();
  if (error) throw error;
  return data as Group;
}

async function loadMembers(db: Db, groupId: string): Promise<Member[]> {
  const { data, error } = await db
    .from("memberships")
    .select("id, display_name, email, role, questionnaire_updated_at, match_email_sent_at")
    .eq("group_id", groupId)
    .order("created_at");
  if (error) throw error;
  return data as Member[];
}

async function loadExclusions(db: Db, groupId: string): Promise<Exclusion[]> {
  const { data, error } = await db.from("exclusion_rules").select("a_id, b_id, two_way").eq("group_id", groupId);
  if (error) throw error;
  return rulesToExclusions(data.map((r) => ({ a: r.a_id as string, b: r.b_id as string, twoWay: r.two_way as boolean })));
}

async function loadAssignments(db: Db, groupId: string): Promise<Assignment[]> {
  const { data, error } = await db.from("assignments").select("giver_id, receiver_id").eq("group_id", groupId);
  if (error) throw error;
  return data.map((a) => ({ giver: a.giver_id as string, receiver: a.receiver_id as string }));
}

async function audit(db: Db, groupId: string, actorUserId: string | null, action: string, details: Record<string, unknown> = {}) {
  await db.from("audit_log").insert({ group_id: groupId, actor_user_id: actorUserId, action, details });
}

async function saveAssignments(
  db: Db,
  groupId: string,
  assignments: Assignment[],
  action: "draw" | "redraw" | "member_added" | "member_removed",
  actorUserId: string,
  removeMember?: string,
) {
  const { error } = await db.rpc("save_assignments", {
    gid: groupId,
    pairs: assignments,
    action,
    actor: actorUserId,
    remove_member: removeMember ?? null,
  });
  if (error) throw error;
}

export function groupBudget(g: Pick<Group, "budget_min_cents" | "budget_max_cents">) {
  return formatBudget({ minCents: g.budget_min_cents, maxCents: g.budget_max_cents, currency: "USD" });
}

export function formatExchangeDate(date: string | null): string | null {
  if (!date) return null;
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Accepts common US formats; returns +E.164, null for empty, or throws on nonsense. */
export function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 10) e164 = `+1${digits}`;
  else if (digits.length === 11 && digits.startsWith("1")) e164 = `+${digits}`;
  else throw new Error("That phone number doesn't look right. Use a 10-digit US number or +country code.");
  if (!/^\+[1-9][0-9]{7,14}$/.test(e164)) throw new Error("That phone number doesn't look right.");
  return e164;
}

export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");
  return email;
}

function normalizeName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) throw new Error("Please enter a name (up to 80 characters).");
  return name;
}

async function savePhone(db: Db, membershipId: string, phone: string | null) {
  if (phone) {
    const { error } = await db
      .from("member_contacts")
      .upsert({ membership_id: membershipId, phone, updated_at: new Date().toISOString() });
    if (error) throw error;
  } else {
    await db.from("member_contacts").delete().eq("membership_id", membershipId);
  }
}

/** A roster or rule change after Match but before Send makes the old matches stale. */
async function clearUnsentMatch(db: Db, groupId: string): Promise<boolean> {
  const { data, error } = await db.rpc("reset_unsent_match", { gid: groupId });
  if (error) throw error;
  return data as boolean;
}

const clearedNote = " The earlier matches were cleared (nothing had been sent), so press Match again.";

function asOutcome(err: unknown): Outcome {
  if (err instanceof Error && !("code" in err)) return { ok: false, message: err.message };
  console.error(err);
  return { ok: false, message: "Something went wrong. Please try again." };
}

// ---------------------------------------------------------------------------
// Roster and rules
// ---------------------------------------------------------------------------

export async function addMember(
  groupId: string,
  actorUserId: string,
  input: { name: string; email: string; phone: string },
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const name = normalizeName(input.name);
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const group = await loadGroup(db, groupId);

    const { data: inserted, error } = await db
      .from("memberships")
      .insert({ group_id: groupId, display_name: name, email })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") return { ok: false, message: `${email} is already in the group.` };
      throw error;
    }
    const memberId = inserted.id as string;
    await savePhone(db, memberId, phone);
    await audit(db, groupId, actorUserId, "member_added");

    if (group.status === "matched") {
      await clearUnsentMatch(db, groupId);
      return { ok: true, message: `Added ${name}.${clearedNote}` };
    }
    if (group.status === "sent") {
      // Splice the newcomer into the existing loop; only one other person's match changes.
      // Never leave someone on the roster without a match: undo the insert if they can't be fitted in.
      const undo = () => db.from("memberships").delete().eq("id", memberId).eq("group_id", groupId);
      let result;
      try {
        result = addParticipant(await loadAssignments(db, groupId), memberId, {
          exclusions: await loadExclusions(db, groupId),
        });
        if (result.ok) await saveAssignments(db, groupId, result.assignments, "member_added", actorUserId);
      } catch (err) {
        await undo();
        throw err;
      }
      if (!result.ok) {
        await undo();
        return {
          ok: false,
          message: `Couldn't fit ${name} in without changing everyone's match. To include them, press Re-match, add them, then Send again.`,
        };
      }
      const sent = await emailMatches(db, group, result.changedGivers, { changedIds: result.changedGivers.filter((g) => g !== memberId) });
      return {
        ok: true,
        message: `Added ${name} and sent them their match. One other person's match changed and they've been emailed.${sent.failedNote}`,
      };
    }
    return { ok: true, message: `Added ${name}.` };
  } catch (err) {
    return asOutcome(err);
  }
}

export async function updateMember(
  groupId: string,
  actorUserId: string,
  memberId: string,
  input: { name: string; email: string; phone: string },
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const name = normalizeName(input.name);
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    const group = await loadGroup(db, groupId);
    const { data: before } = await db
      .from("memberships")
      .select("email, display_name")
      .eq("id", memberId)
      .eq("group_id", groupId)
      .single();
    if (!before) return { ok: false, message: "That person isn't in this group." };

    const { error } = await db.from("memberships").update({ display_name: name, email }).eq("id", memberId).eq("group_id", groupId);
    if (error) {
      if (error.code === "23505") return { ok: false, message: `${email} is already in the group.` };
      throw error;
    }
    await savePhone(db, memberId, phone);
    const emailChanged = before.email !== email;
    await audit(db, groupId, actorUserId, "member_updated", { email_changed: emailChanged });
    if (emailChanged && group.status !== "draft") {
      // Matches exist, so a changed address could be used to read someone's match. Tell the old address.
      const [told] = await sendEmails([
        emailChangedNotice({ to: before.email as string, name: before.display_name as string, groupName: group.name, newEmail: email }),
      ]);
      const toldNote = told ? " We let their old address know about the change." : "";
      return group.status === "sent"
        ? { ok: true, message: `Saved. Their email changed, so press "Resend match email" to send their match to the new address.${toldNote}` }
        : { ok: true, message: `Saved.${toldNote}` };
    }
    return { ok: true, message: "Saved." };
  } catch (err) {
    return asOutcome(err);
  }
}

export async function removeMember(groupId: string, actorUserId: string, memberId: string): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    const { data: member } = await db
      .from("memberships")
      .select("display_name, role")
      .eq("id", memberId)
      .eq("group_id", groupId)
      .single();
    if (!member) return { ok: false, message: "That person isn't in this group." };
    if (member.role === "organizer") return { ok: false, message: "The organizer can't be removed." };

    if (group.status === "sent") {
      const result = removeParticipant(await loadAssignments(db, groupId), memberId, {
        exclusions: await loadExclusions(db, groupId),
      });
      if (!result.ok && result.reason === "not_in_draw") {
        // They never had a match, so nobody else is affected.
        const { error } = await db.from("memberships").delete().eq("id", memberId).eq("group_id", groupId);
        if (error) throw error;
        await audit(db, groupId, actorUserId, "member_removed");
        return { ok: true, message: `Removed ${member.display_name}.` };
      }
      if (!result.ok) {
        return {
          ok: false,
          message: `${member.display_name} can't be removed without changing everyone's match. Re-match first, then remove them and send again.`,
        };
      }
      await saveAssignments(db, groupId, result.assignments, "member_removed", actorUserId, memberId);
      const sent = await emailMatches(db, group, result.changedGivers, { changedIds: result.changedGivers });
      const n = result.changedGivers.length;
      return {
        ok: true,
        message: `Removed ${member.display_name}. ${n === 1 ? "One person" : `${n} people`} got a new match by email.${sent.failedNote}`,
      };
    }

    const cleared = group.status === "matched" && (await clearUnsentMatch(db, groupId));
    const { error } = await db.from("memberships").delete().eq("id", memberId).eq("group_id", groupId);
    if (error) throw error;
    await audit(db, groupId, actorUserId, "member_removed");
    return { ok: true, message: `Removed ${member.display_name}.${cleared ? clearedNote : ""}` };
  } catch (err) {
    return asOutcome(err);
  }
}

export async function addRule(groupId: string, actorUserId: string, aId: string, bId: string, twoWay: boolean): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    if (!UUID.test(aId) || !UUID.test(bId)) return { ok: false, message: "Pick two people." };
    if (aId === bId) return { ok: false, message: "Pick two different people." };
    const group = await loadGroup(db, groupId);
    const { data: existing } = await db
      .from("exclusion_rules")
      .select("id")
      .eq("group_id", groupId)
      .or(`and(a_id.eq.${aId},b_id.eq.${bId}),and(a_id.eq.${bId},b_id.eq.${aId})`);
    if (existing && existing.length) await db.from("exclusion_rules").delete().in("id", existing.map((r) => r.id));
    const { error } = await db.from("exclusion_rules").insert({ group_id: groupId, a_id: aId, b_id: bId, two_way: twoWay });
    if (error) throw error;
    await audit(db, groupId, actorUserId, "rule_added");
    const cleared = group.status === "matched" && (await clearUnsentMatch(db, groupId));
    const note = group.status === "sent" ? " Matches were already sent; this rule applies if you re-match." : "";
    return { ok: true, message: `Rule added.${cleared ? clearedNote : note}` };
  } catch (err) {
    return asOutcome(err);
  }
}

export async function removeRule(groupId: string, actorUserId: string, ruleId: string): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    const { error } = await db.from("exclusion_rules").delete().eq("id", ruleId).eq("group_id", groupId);
    if (error) throw error;
    await audit(db, groupId, actorUserId, "rule_removed");
    const cleared = group.status === "matched" && (await clearUnsentMatch(db, groupId));
    return { ok: true, message: `Rule removed.${cleared ? clearedNote : ""}` };
  } catch (err) {
    return asOutcome(err);
  }
}

export async function updateSettings(
  groupId: string,
  actorUserId: string,
  input: { name: string; budgetMin: string; budgetMax: string; exchangeDate: string },
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const name = input.name.trim();
    if (!name || name.length > 100) return { ok: false, message: "Please enter a group name." };
    const min = Math.round(Number(input.budgetMin) * 100);
    const max = Math.round(Number(input.budgetMax) * 100);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
      return { ok: false, message: "Budget: the maximum must be at least the minimum." };
    }
    const date = input.exchangeDate.trim() || null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, message: "Please pick a valid date." };
    const { error } = await db
      .from("groups")
      .update({ name, budget_min_cents: min, budget_max_cents: max, exchange_date: date })
      .eq("id", groupId);
    if (error) throw error;
    await audit(db, groupId, actorUserId, "settings_updated");
    return { ok: true, message: "Settings saved." };
  } catch (err) {
    return asOutcome(err);
  }
}

// ---------------------------------------------------------------------------
// Match and Send
// ---------------------------------------------------------------------------

export function explainProblem(problem: DrawProblem, name: (id: string) => string): string {
  const list = (ids: string[]) => ids.map(name).join(", ");
  switch (problem.kind) {
    case "too_few_participants":
      return "Add at least 3 people before matching.";
    case "duplicate_participant":
      return `${name(problem.participant)} is on the list twice.`;
    case "unknown_participant_in_rule":
      return "A rule mentions someone who is no longer in the group. Remove that rule and try again.";
    case "rules_too_strict":
      return problem.canOnlyDraw.length === 0
        ? `The rules leave ${list(problem.givers)} with nobody to draw. Remove one of their rules.`
        : `The rules leave ${list(problem.givers)} able to draw only ${list(problem.canOnlyDraw)}, ` +
            `so someone would be left out. Remove one of their rules.`;
  }
}

/**
 * The Match button. Makes (or remakes) matches without sending anything.
 * After Send, re-matching needs `confirmedAfterSend`, and the organizer must press Send again.
 */
export async function matchGroup(
  groupId: string,
  actorUserId: string,
  { confirmedAfterSend = false }: { confirmedAfterSend?: boolean } = {},
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    if (group.status === "sent" && !confirmedAfterSend) {
      return { ok: false, message: "Matches were already sent. Confirm to re-match; then press Send so everyone gets their new match." };
    }
    const members = await loadMembers(db, groupId);
    if (members.length < 3) return { ok: false, message: "Add at least 3 people before matching." };

    const participants = members.map((m) => m.id);
    const exclusions = await loadExclusions(db, groupId);
    const result = draw({ participants, exclusions });
    if (!result.ok) {
      const names = new Map(members.map((m) => [m.id, m.display_name]));
      return { ok: false, message: explainProblem(result.problem, (id) => names.get(id) ?? "someone") };
    }
    // Second line of defense: never save anything that breaks a rule.
    const errors = validateAssignments(participants, exclusions, result.assignments);
    if (errors.length) throw new Error(`Draw produced invalid matches: ${errors.map((e) => e.kind).join(", ")}`);

    await saveAssignments(db, groupId, result.assignments, group.status === "draft" ? "draw" : "redraw", actorUserId);
    return {
      ok: true,
      message: `${members.length} people matched ✓ Nothing has been sent yet. Press Send when you're ready.`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}

/**
 * Emails each listed giver their match. Reads pairings internally; returns only counts.
 * `changedIds` get the "your match has changed" wording.
 */
async function emailMatches(
  db: Db,
  group: Group,
  giverIds: readonly string[],
  { changedIds = [] }: { changedIds?: readonly string[] } = {},
): Promise<{ sent: number; failed: string[]; failedNote: string }> {
  const members = await loadMembers(db, group.id);
  const byId = new Map(members.map((m) => [m.id, m]));
  const receiverOf = new Map((await loadAssignments(db, group.id)).map((a) => [a.giver, a.receiver]));
  const budget = groupBudget(group);
  const exchangeDate = formatExchangeDate(group.exchange_date);

  const targets = giverIds.map((id) => byId.get(id)).filter((m): m is Member => Boolean(m && receiverOf.has(m.id)));
  const links = await Promise.all(targets.map((m) => signInLink(m.email, `/g/${group.id}`)));
  const emails: OutgoingEmail[] = targets.map((m, i) => {
    const giftee = byId.get(receiverOf.get(m.id)!)!;
    return matchEmail({
      to: m.email,
      name: m.display_name,
      giftee: giftee.display_name,
      groupName: group.name,
      budget,
      exchangeDate,
      gifteeHasAnswers: Boolean(giftee.questionnaire_updated_at),
      link: links[i]!,
      changed: changedIds.includes(m.id),
    });
  });
  const results = await sendEmails(emails);
  const now = new Date().toISOString();
  const okIds = targets.filter((_, i) => results[i]).map((m) => m.id);
  const failed = targets.filter((_, i) => !results[i]);
  if (okIds.length) await db.from("memberships").update({ match_email_status: "sent", match_email_sent_at: now }).in("id", okIds);
  if (failed.length) await db.from("memberships").update({ match_email_status: "failed" }).in("id", failed.map((m) => m.id));

  // Santas just got a fresh look at their giftee, so earlier edits don't need a separate email.
  const receivers = okIds.map((id) => receiverOf.get(id)!);
  if (receivers.length) {
    await db
      .from("profile_notifications")
      .upsert(receivers.map((id) => ({ membership_id: id, last_edit_at: now, notified_at: now })));
  }

  const failedNames = failed.map((m) => m.display_name);
  return {
    sent: okIds.length,
    failed: failedNames,
    failedNote: failedNames.length ? ` Couldn't email ${failedNames.join(", ")}; check their address and press Resend.` : "",
  };
}

/** The Send button: emails everyone their match. */
export async function sendAllMatches(groupId: string, actorUserId: string): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    if (group.status === "draft") return { ok: false, message: "Press Match first." };
    if (group.status === "sent") return { ok: false, message: "Already sent. Use Resend for one person, or re-match to start over." };

    // Claim the send first, so a second click or a second tab can't email everyone twice.
    const { data: claimed, error: claimError } = await db
      .from("groups")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", groupId)
      .eq("status", "matched")
      .select("id");
    if (claimError) throw claimError;
    if (!claimed?.length) return { ok: false, message: "Already sending. Refresh the page in a moment to see the result." };

    const members = await loadMembers(db, groupId);
    // After a re-match, people who already got an earlier match are told theirs has changed.
    const changedIds = members.filter((m) => m.match_email_sent_at).map((m) => m.id);
    let result;
    try {
      result = await emailMatches(db, group, members.map((m) => m.id), { changedIds });
    } catch (err) {
      await db.from("groups").update({ status: "matched", sent_at: null }).eq("id", groupId);
      throw err;
    }
    if (result.sent === 0) {
      await db.from("groups").update({ status: "matched", sent_at: null }).eq("id", groupId);
      await audit(db, groupId, actorUserId, "send_failed", { failed: result.failed.length });
      return { ok: false, message: "No emails could be sent, so nothing has changed. Please try Send again in a few minutes." };
    }
    await audit(db, groupId, actorUserId, "sent", { sent: result.sent, failed: result.failed.length });
    return {
      ok: result.failed.length === 0,
      message: `Sent ✓ ${result.sent} ${result.sent === 1 ? "person has" : "people have"} their match.${result.failedNote}`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}

/** Resend one person's match email (e.g. after fixing their address). */
export async function resendMatch(groupId: string, actorUserId: string, memberId: string): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    if (group.status !== "sent") return { ok: false, message: "Matches haven't been sent yet." };
    const result = await emailMatches(db, group, [memberId]);
    await audit(db, groupId, actorUserId, "resent", { ok: result.sent === 1 });
    const name = (await loadMembers(db, groupId)).find((m) => m.id === memberId)?.display_name ?? "them";
    return result.sent ? { ok: true, message: `Sent to ${name} ✓` } : { ok: false, message: `Couldn't email ${name}. Check their address.` };
  } catch (err) {
    return asOutcome(err);
  }
}

// ---------------------------------------------------------------------------
// Reminders and profile-update notifications
// ---------------------------------------------------------------------------

/** Reminder emails: one person, or everyone who hasn't completed their questionnaire. */
export async function sendReminders(groupId: string, actorUserId: string, memberId: string | null): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    const { data, error } = await db
      .from("memberships")
      .select("id, display_name, email, questionnaire_complete")
      .eq("group_id", groupId);
    if (error) throw error;
    const targets = memberId ? data.filter((m) => m.id === memberId) : data.filter((m) => !m.questionnaire_complete);
    if (!targets.length) return { ok: true, message: "Everyone has filled theirs out. Nobody to remind 🎉" };

    const emails: OutgoingEmail[] = [];
    for (const m of targets) {
      emails.push(
        reminderEmail({ to: m.email, name: m.display_name, groupName: group.name, link: await signInLink(m.email, `/g/${groupId}#questionnaire`) }),
      );
    }
    const results = await sendEmails(emails);
    const okIds = targets.filter((_, i) => results[i]).map((m) => m.id);
    if (okIds.length) await db.from("memberships").update({ last_reminded_at: new Date().toISOString() }).in("id", okIds);
    await audit(db, groupId, actorUserId, "reminded", { count: okIds.length });
    const failed = targets.length - okIds.length;
    return {
      ok: failed === 0,
      message: `Reminder sent to ${okIds.length === 1 && targets[0] ? targets[0].display_name : `${okIds.length} people`} ✓${failed ? ` (${failed} failed)` : ""}`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}

/**
 * Emails Santas whose giftee updated their questionnaire. Runs after each save
 * and from a daily cron. Throttled to one email per giftee per 30 minutes; anything
 * held back goes out on the next run.
 */
export async function deliverProfileUpdates(): Promise<number> {
  const db = createAdminClient();
  const { data: rows, error } = await db.from("profile_notifications").select("membership_id, last_edit_at, notified_at");
  if (error) throw error;
  const now = Date.now();
  const due = rows.filter((r) => {
    if (!r.notified_at) return true;
    const notified = Date.parse(r.notified_at as string);
    return Date.parse(r.last_edit_at as string) > notified && now - notified >= PROFILE_NOTIFY_THROTTLE_MS;
  });
  if (!due.length) return 0;

  const gifteeIds = due.map((r) => r.membership_id as string);
  const { data: pairs, error: pairsError } = await db
    .from("assignments")
    .select("giver_id, receiver_id, group_id, groups!inner(status)")
    .in("receiver_id", gifteeIds)
    .eq("groups.status", "sent");
  if (pairsError) throw pairsError;
  if (!pairs.length) return 0;

  const memberIds = [...new Set(pairs.flatMap((p) => [p.giver_id as string, p.receiver_id as string]))];
  const { data: members, error: membersError } = await db
    .from("memberships")
    .select("id, display_name, email")
    .in("id", memberIds);
  if (membersError) throw membersError;
  const byId = new Map(members.map((m) => [m.id as string, m]));

  const emails: OutgoingEmail[] = [];
  const notifiedGiftees: string[] = [];
  for (const p of pairs) {
    const santa = byId.get(p.giver_id as string);
    const giftee = byId.get(p.receiver_id as string);
    if (!santa || !giftee) continue;
    emails.push(
      profileUpdatedEmail({
        to: santa.email as string,
        name: santa.display_name as string,
        giftee: giftee.display_name as string,
        link: await signInLink(santa.email as string, `/g/${p.group_id}#match`),
      }),
    );
    notifiedGiftees.push(giftee.id as string);
  }
  const results = await sendEmails(emails);
  const sentFor = notifiedGiftees.filter((_, i) => results[i]);
  if (sentFor.length) {
    await db.from("profile_notifications").update({ notified_at: new Date().toISOString() }).in("membership_id", sentFor);
  }
  return sentFor.length;
}
