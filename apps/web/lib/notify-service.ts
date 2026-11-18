import "server-only";
import { createAdminClient } from "./supabase/admin";
import { signInLink } from "./links";
import { sendEmails, type OutgoingEmail } from "./email/send";
import { announcementEmail, reminderEmail } from "./email/templates";
import {
  pickReminderTargets,
  pickResendTargets,
  type RecipientInfo,
  type ReminderAudience,
  type ResendAudience,
} from "./audience";
import { asOutcome, assertAdmin, audit, emailMatches, loadGroup, type Db, type Outcome } from "./group-service";

/**
 * Organizer notification tools: reminders, resending match emails, announcements and
 * automatic reminders. Like group-service, every function returns only counts and plain
 * messages. Resending reads pairings internally (to build each person's own email) and
 * never returns them.
 */

type Recipient = RecipientInfo & { email: string };

const RECIPIENT_COLUMNS =
  "id, display_name, email, user_id, questionnaire_complete, questionnaire_updated_at, last_reminded_at, match_email_status";

async function loadRecipients(db: Db, groupId: string): Promise<Recipient[]> {
  const { data, error } = await db.from("memberships").select(RECIPIENT_COLUMNS).eq("group_id", groupId).order("created_at");
  if (error) throw error;
  return data as Recipient[];
}

/**
 * Per-person questionnaire progress and last reminder time, for the organizer page.
 *
 * `questionnaire_updated_at` and `last_reminded_at` are not granted to the organizer's own login
 * (migration 20261116000000, security review M-2), so the page reads them here, after the same
 * admin check every organizer action uses. Neither says anything about matches.
 * Never add `match_email_sent_at` or `match_email_retry` to this list: they show whose match changed.
 */
export async function loadProgress(
  groupId: string,
  actorUserId: string,
): Promise<Record<string, { questionnaire_updated_at: string | null; last_reminded_at: string | null }>> {
  const db = createAdminClient();
  await assertAdmin(db, groupId, actorUserId);
  const { data, error } = await db.from("memberships").select("id, questionnaire_updated_at, last_reminded_at").eq("group_id", groupId);
  if (error) throw error;
  return Object.fromEntries(
    data.map((m) => [m.id as string, { questionnaire_updated_at: m.questionnaire_updated_at as string | null, last_reminded_at: m.last_reminded_at as string | null }]),
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Sends one reminder per person and records who actually got one. Returns who succeeded. */
async function deliverReminders(
  db: Db,
  group: { id: string; name: string },
  targets: readonly Recipient[],
  note: string | undefined,
  afterSend: (okIds: string[], now: string) => Promise<void>,
): Promise<{ sent: number; failed: number; first: Recipient | undefined }> {
  const emails: OutgoingEmail[] = [];
  for (const m of targets) {
    emails.push(
      reminderEmail({
        to: m.email,
        name: m.display_name,
        groupName: group.name,
        note,
        link: await signInLink(m.email, `/g/${group.id}#questionnaire`),
      }),
    );
  }
  const results = await sendEmails(emails);
  const ok = targets.filter((_, i) => results[i]);
  if (ok.length) await afterSend(ok.map((m) => m.id), new Date().toISOString());
  return { sent: ok.length, failed: targets.length - ok.length, first: ok[0] };
}

// ---------------------------------------------------------------------------
// Questionnaire reminders
// ---------------------------------------------------------------------------

export const NOTE_MAX = 500;

/**
 * Reminds one person (`memberId`), or a group of people picked by `audience`.
 * A bulk reminder skips anyone reminded in the last 24 hours unless `includeRecent` is set.
 * An optional personal note from the organizer is added to the email.
 */
export async function sendReminders(
  groupId: string,
  actorUserId: string,
  opts: { memberId?: string | null; audience?: ReminderAudience; note?: string; includeRecent?: boolean } = {},
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const note = (opts.note ?? "").trim();
    if (note.length > NOTE_MAX) return { ok: false, message: `Keep your note under ${NOTE_MAX} characters.` };
    const group = await loadGroup(db, groupId);
    const members = await loadRecipients(db, groupId);

    let targets: Recipient[];
    let skippedRecent = 0;
    if (opts.memberId) {
      targets = members.filter((m) => m.id === opts.memberId);
    } else {
      ({ targets, skippedRecent } = pickReminderTargets(members, opts.audience ?? "not_done", { includeRecent: opts.includeRecent }));
    }
    const skippedNote = skippedRecent
      ? ` Skipped ${plural(skippedRecent, "person", "people")} reminded in the last 24 hours.`
      : "";
    if (!targets.length) {
      return {
        ok: true,
        message: skippedRecent ? `Nobody to remind right now.${skippedNote}` : "Nobody to remind. Everyone in that group has filled theirs out 🎉",
      };
    }

    const result = await deliverReminders(db, group, targets, note || undefined, async (okIds, now) => {
      await db.from("memberships").update({ last_reminded_at: now }).in("id", okIds);
    });
    await audit(db, groupId, actorUserId, "reminded", { count: result.sent });
    const who = result.sent === 1 && result.first ? result.first.display_name : plural(result.sent, "person", "people");
    return {
      ok: result.failed === 0,
      message: `Reminder sent to ${who} ✓${result.failed ? ` (${result.failed} failed)` : ""}${skippedNote}`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}

// ---------------------------------------------------------------------------
// Resend match emails
// ---------------------------------------------------------------------------

/**
 * Re-emails people their match (someone lost the email, or it went to spam). Each person gets
 * a fresh sign-in link. Returns counts only.
 */
export async function resendMatches(groupId: string, actorUserId: string, audience: ResendAudience): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const group = await loadGroup(db, groupId);
    if (group.status !== "sent") return { ok: false, message: "Matches haven't been sent yet. Press Send first." };

    const targets = pickResendTargets(await loadRecipients(db, groupId), audience);
    if (!targets.length) return { ok: true, message: "Nobody needs it. Everyone in that group already has their email 🎉" };

    const result = await emailMatches(db, group, targets.map((m) => m.id));
    await audit(db, groupId, actorUserId, "resent_bulk", { count: result.sent, failed: result.failed.length });
    return {
      ok: result.failed.length === 0,
      message: `Match email resent to ${plural(result.sent, "person", "people")} ✓${result.failedNote}`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export const ANNOUNCEMENT_SUBJECT_MAX = 100;
export const ANNOUNCEMENT_MESSAGE_MAX = 2000;

/** A message from the organizer to everyone in the group, or (`testOnly`) just a test copy to the organizer. */
export async function sendAnnouncement(
  groupId: string,
  actorUserId: string,
  input: { subject: string; message: string; testOnly?: boolean },
): Promise<Outcome> {
  const db = createAdminClient();
  try {
    await assertAdmin(db, groupId, actorUserId);
    const subject = input.subject.replace(/\s+/g, " ").trim();
    const message = input.message.trim();
    if (!subject || subject.length > ANNOUNCEMENT_SUBJECT_MAX) {
      return { ok: false, message: `Please add a subject (up to ${ANNOUNCEMENT_SUBJECT_MAX} characters).` };
    }
    if (!message || message.length > ANNOUNCEMENT_MESSAGE_MAX) {
      return { ok: false, message: `Please write a message (up to ${ANNOUNCEMENT_MESSAGE_MAX} characters).` };
    }

    const group = await loadGroup(db, groupId);
    const everyone = await loadRecipients(db, groupId);
    const members = input.testOnly ? everyone.filter((m) => m.user_id === actorUserId) : everyone;
    if (input.testOnly && !members.length) return { ok: false, message: "Couldn't find your own entry in the group." };
    const emails: OutgoingEmail[] = [];
    for (const m of members) {
      emails.push(
        announcementEmail({
          to: m.email,
          name: m.display_name,
          groupName: group.name,
          subject: input.testOnly ? `[Test] ${subject}` : subject,
          message,
          link: await signInLink(m.email, `/g/${groupId}`),
        }),
      );
    }
    const results = await sendEmails(emails);
    if (input.testOnly) {
      return results[0]
        ? { ok: true, message: `Test sent to ${members[0]!.email} ✓ Nobody else has received it.` }
        : { ok: false, message: "The test email couldn't be sent." };
    }
    const sent = results.filter(Boolean).length;
    const failed = members.filter((_, i) => !results[i]).map((m) => m.display_name);
    await audit(db, groupId, actorUserId, "announced", { count: sent, failed: failed.length });
    return {
      ok: failed.length === 0,
      message: `Announcement sent to ${plural(sent, "person", "people")} ✓${failed.length ? ` Couldn't email ${failed.join(", ")}.` : ""}`,
    };
  } catch (err) {
    return asOutcome(err);
  }
}
