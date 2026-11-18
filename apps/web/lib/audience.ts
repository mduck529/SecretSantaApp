/**
 * Who should get a notification. Pure functions, no database access, so the rules
 * are easy to test. None of these inputs contain pairings.
 */

export interface RecipientInfo {
  id: string;
  display_name: string;
  user_id: string | null;
  questionnaire_complete: boolean;
  questionnaire_updated_at: string | null;
  last_reminded_at: string | null;
  match_email_status: "not_sent" | "sent" | "failed";
  auto_reminder_count: number;
}

export type QuestionnaireState = "done" | "started" | "not_started";

export function questionnaireState(m: Pick<RecipientInfo, "questionnaire_complete" | "questionnaire_updated_at">): QuestionnaireState {
  if (m.questionnaire_complete) return "done";
  return m.questionnaire_updated_at ? "started" : "not_started";
}

// --- Questionnaire reminders -------------------------------------------------

export const REMINDER_AUDIENCES = {
  not_done: "Everyone who hasn't finished",
  not_started: "People who haven't started",
  started: "People who started but haven't finished",
} as const;
export type ReminderAudience = keyof typeof REMINDER_AUDIENCES;

export function isReminderAudience(value: unknown): value is ReminderAudience {
  return typeof value === "string" && Object.hasOwn(REMINDER_AUDIENCES, value);
}

/** Bulk reminders skip anyone nudged in the last day, so the family doesn't get nagged. */
export const REMINDER_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function inReminderAudience(m: RecipientInfo, audience: ReminderAudience): boolean {
  const state = questionnaireState(m);
  switch (audience) {
    case "not_done":
      return state !== "done";
    case "not_started":
      return state === "not_started";
    case "started":
      return state === "started";
  }
}

export function recentlyReminded(m: Pick<RecipientInfo, "last_reminded_at">, now: number): boolean {
  return m.last_reminded_at !== null && now - Date.parse(m.last_reminded_at) < REMINDER_COOLDOWN_MS;
}

export function pickReminderTargets<T extends RecipientInfo>(
  members: readonly T[],
  audience: ReminderAudience,
  { now = Date.now(), includeRecent = false }: { now?: number; includeRecent?: boolean } = {},
): { targets: T[]; skippedRecent: number } {
  const inAudience = members.filter((m) => inReminderAudience(m, audience));
  if (includeRecent) return { targets: inAudience, skippedRecent: 0 };
  const targets = inAudience.filter((m) => !recentlyReminded(m, now));
  return { targets, skippedRecent: inAudience.length - targets.length };
}

// --- Match email resend ------------------------------------------------------

export const RESEND_AUDIENCES = {
  everyone: "Everyone",
  not_signed_in: "People who haven't opened their link yet",
  undelivered: "People whose email failed or never went out",
} as const;
export type ResendAudience = keyof typeof RESEND_AUDIENCES;

export function isResendAudience(value: unknown): value is ResendAudience {
  return typeof value === "string" && Object.hasOwn(RESEND_AUDIENCES, value);
}

export function pickResendTargets<T extends RecipientInfo>(members: readonly T[], audience: ResendAudience): T[] {
  switch (audience) {
    case "everyone":
      return [...members];
    case "not_signed_in":
      return members.filter((m) => m.user_id === null);
    case "undelivered":
      return members.filter((m) => m.match_email_status !== "sent");
  }
}

// --- Automatic reminders -----------------------------------------------------

export const AUTO_REMIND = {
  /** Wait this long after Send before the first automatic reminder. */
  firstAfterMs: 2 * 24 * 60 * 60 * 1000,
  /** Then at most one every 3 days. */
  everyMs: 3 * 24 * 60 * 60 * 1000,
  /** Stop after this many, however long the exchange is away. */
  maxReminders: 3,
} as const;

/**
 * True when the daily job should send this person an automatic reminder.
 * Never after the exchange date, never to people who finished, never to someone
 * a human reminded recently.
 */
export function isAutoReminderDue(
  group: { auto_remind: boolean; status: string; sent_at: string | null; exchange_date: string | null },
  m: RecipientInfo,
  now: number,
): boolean {
  if (!group.auto_remind || group.status !== "sent" || !group.sent_at) return false;
  if (m.questionnaire_complete || m.auto_reminder_count >= AUTO_REMIND.maxReminders) return false;
  if (group.exchange_date && now >= Date.parse(`${group.exchange_date}T23:59:59Z`)) return false;
  if (now - Date.parse(group.sent_at) < AUTO_REMIND.firstAfterMs) return false;
  const last = m.last_reminded_at ? Date.parse(m.last_reminded_at) : null;
  return last === null || now - last >= AUTO_REMIND.everyMs;
}

// --- Dashboard summary -------------------------------------------------------

export interface StatusSummary {
  total: number;
  signedIn: number;
  emailed: number;
  emailFailed: number;
  done: number;
  started: number;
  notStarted: number;
}

export function summarize(members: readonly RecipientInfo[]): StatusSummary {
  const s: StatusSummary = { total: members.length, signedIn: 0, emailed: 0, emailFailed: 0, done: 0, started: 0, notStarted: 0 };
  for (const m of members) {
    if (m.user_id) s.signedIn++;
    if (m.match_email_status === "sent") s.emailed++;
    if (m.match_email_status === "failed") s.emailFailed++;
    const q = questionnaireState(m);
    if (q === "done") s.done++;
    else if (q === "started") s.started++;
    else s.notStarted++;
  }
  return s;
}
