import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { formatExchangeDate, groupBudget } from "@/lib/group-service";
import {
  REMINDER_AUDIENCES,
  REMINDER_COOLDOWN_MS,
  RESEND_AUDIENCES,
  pickReminderTargets,
  pickResendTargets,
  questionnaireState,
  summarize,
  type RecipientInfo,
} from "@/lib/audience";
import { describeAudit } from "@/lib/audit-labels";
import { LocalTime } from "@/components/local-time";
import {
  addPersonAction,
  addRuleAction,
  announceAction,
  matchAction,
  remindAction,
  removePersonAction,
  removeRuleAction,
  resendAction,
  resendAllAction,
  sendAction,
  settingsAction,
  updatePersonAction,
} from "./actions";

export const metadata = { title: "Organizer · Secret Santa" };

/**
 * Organizer page. Everything here is read through Row Level Security as the organizer,
 * who can't read anyone's match or answers, so this page cannot show pairings.
 */
export default async function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params;
  const { supabase } = await requireAdmin(groupId);

  const [{ data: group }, { data: members }, { data: contacts }, { data: rules }, { data: activity }] = await Promise.all([
    supabase
      .from("groups")
      .select("name, status, budget_min_cents, budget_max_cents, exchange_date, sent_at")
      .eq("id", groupId)
      .single(),
    supabase
      .from("memberships")
      .select(
        "id, display_name, email, role, user_id, questionnaire_complete, questionnaire_updated_at, match_email_status, match_email_sent_at, last_reminded_at",
      )
      .eq("group_id", groupId)
      .order("created_at"),
    supabase.from("member_contacts").select("membership_id, phone"),
    supabase.from("exclusion_rules").select("id, a_id, b_id, two_way").eq("group_id", groupId),
    supabase.from("audit_log").select("id, action, details, actor_user_id, created_at").eq("group_id", groupId).order("created_at", { ascending: false }).limit(15),
  ]);
  if (!group || !members) return null;

  const phoneOf = new Map((contacts ?? []).map((c) => [c.membership_id as string, c.phone as string]));
  const nameOf = new Map(members.map((m) => [m.id as string, m.display_name as string]));
  const status = group.status as "draft" | "matched" | "sent";
  const info = members as unknown as RecipientInfo[];
  const summary = summarize(info);
  const now = Date.now();
  const notDone = pickReminderTargets(info, "not_done", { now, includeRecent: true }).targets.length;
  const notDoneFresh = pickReminderTargets(info, "not_done", { now }).targets.length;
  const needsResend = pickResendTargets(info, "undelivered").length;
  const notSignedIn = pickResendTargets(info, "not_signed_in").length;
  const actorName = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.display_name as string]));
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const gid = hidden("group_id", groupId);

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Organizer</p>
          <h1>{group.name}</h1>
          <p className="muted">
            Budget {groupBudget(group)}
            {group.exchange_date ? ` · ${formatExchangeDate(group.exchange_date)}` : ""}
          </p>
        </div>
        <Link className="button" href={`/g/${groupId}`}>
          My page
        </Link>
      </header>

      <ol className="steps" aria-label="Progress">
        <li className={members.length >= 3 ? "done" : "current"}>Add people</li>
        <li className={members.length >= 3 ? "done" : ""}>Rules</li>
        <li className={status !== "draft" ? "done" : members.length >= 3 ? "current" : ""}>Match</li>
        <li className={status === "sent" ? "done" : status === "matched" ? "current" : ""}>Send</li>
      </ol>

      {status === "sent" ? (
        <section className="card" aria-label="Status">
          <h2>Where things stand</h2>
          <dl className="stats">
            <div>
              <dt>Opened their link</dt>
              <dd>
                {summary.signedIn} <span className="muted">of {summary.total}</span>
              </dd>
            </div>
            <div>
              <dt>Match email delivered</dt>
              <dd>
                {summary.emailed} <span className="muted">of {summary.total}</span>
                {summary.emailFailed ? <span className="badge no">{summary.emailFailed} failed</span> : null}
              </dd>
            </div>
            <div>
              <dt>Questionnaire done</dt>
              <dd>
                {summary.done} <span className="muted">of {summary.total}</span>
              </dd>
            </div>
            <div>
              <dt>Started, not finished</dt>
              <dd>{summary.started}</dd>
            </div>
          </dl>
          <p className="muted small">
            This never shows who has whom or what anyone answered. &ldquo;Done&rdquo; means the required questions are answered.
          </p>
        </section>
      ) : null}

      {/* 1 + 2: people and rules */}
      <section className="card">
        <h2>1. People &amp; rules</h2>
        <p className="muted">
          {members.length} {members.length === 1 ? "person" : "people"}. Add a &ldquo;can&apos;t draw&rdquo; rule on anyone
          (couples, people who live together…). Rules go both ways unless you tick &ldquo;one way only&rdquo;.
        </p>
        <ul className="people">
          {members.map((m) => {
            const myRules = (rules ?? []).filter((r) => r.a_id === m.id || r.b_id === m.id);
            const blocked = new Set(myRules.map((r) => (r.a_id === m.id ? r.b_id : r.a_id)));
            const options = members.filter((o) => o.id !== m.id && !blocked.has(o.id));
            return (
              <li key={m.id} className="person">
                <div className="person-head">
                  <div>
                    <strong>{m.display_name}</strong>
                    {m.role === "organizer" ? <span className="pill">organizer</span> : null}
                    <div className="muted small">
                      {m.email}
                      {phoneOf.get(m.id) ? ` · ${phoneOf.get(m.id)}` : ""}
                    </div>
                    {status === "sent" ? (
                      <div className="muted small">
                        {m.match_email_sent_at ? <>Match email <LocalTime iso={m.match_email_sent_at as string} /></> : "No match email yet"}
                        {m.last_reminded_at ? <> · reminded <LocalTime iso={m.last_reminded_at as string} /></> : null}
                      </div>
                    ) : null}
                  </div>
                  <div className="badges">
                    <span className={m.user_id ? "badge yes" : "badge"}>{m.user_id ? "Signed in" : "Not signed in"}</span>
                    <span className={questionnaireState(m as unknown as RecipientInfo) === "done" ? "badge yes" : "badge"}>
                      {{ done: "Questionnaire ✓", started: "Questionnaire started", not_started: "No questionnaire" }[
                        questionnaireState(m as unknown as RecipientInfo)
                      ]}
                    </span>
                    {status === "sent" ? (
                      <span className={m.match_email_status === "failed" ? "badge no" : m.match_email_status === "sent" ? "badge yes" : "badge"}>
                        {m.match_email_status === "sent" ? "Email sent" : m.match_email_status === "failed" ? "Email failed" : "Not emailed"}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="rules">
                  <span className="small">Can&apos;t draw:</span>
                  {myRules.length === 0 ? <span className="small muted">anyone is fine</span> : null}
                  {myRules.map((r) => {
                    const other = r.a_id === m.id ? r.b_id : r.a_id;
                    const direction = r.two_way ? "" : r.a_id === m.id ? " (one way)" : " (they can't draw this person)";
                    return (
                      <ActionForm key={r.id} action={removeRuleAction} className="chip">
                        {gid}
                        {hidden("rule_id", r.id)}
                        <span>
                          {nameOf.get(other)}
                          {direction}
                        </span>
                        <button type="submit" aria-label={`Remove rule ${m.display_name} / ${nameOf.get(other)}`}>
                          ×
                        </button>
                      </ActionForm>
                    );
                  })}
                  {options.length ? (
                    <ActionForm action={addRuleAction} className="inline">
                      {gid}
                      {hidden("member_id", m.id)}
                      <select name="other_id" defaultValue="" aria-label={`Someone ${m.display_name} can't draw`}>
                        <option value="">+ add…</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.display_name}
                          </option>
                        ))}
                      </select>
                      <label className="small check">
                        <input type="checkbox" name="one_way" /> one way only
                      </label>
                      <SubmitButton className="small">Add</SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>

                <details>
                  <summary className="small">Edit, remind, or remove</summary>
                  <ActionForm action={updatePersonAction} className="stack compact">
                    {gid}
                    {hidden("member_id", m.id)}
                    <div className="row">
                      <label>
                        Name
                        <input name="name" defaultValue={m.display_name} required maxLength={80} />
                      </label>
                      <label>
                        Email
                        <input name="email" type="email" defaultValue={m.email} required />
                      </label>
                      <label>
                        Phone (optional)
                        <input name="phone" type="tel" defaultValue={phoneOf.get(m.id) ?? ""} />
                      </label>
                    </div>
                    <SubmitButton>Save</SubmitButton>
                  </ActionForm>
                  <div className="row actions">
                    <ActionForm action={remindAction}>
                      {gid}
                      {hidden("member_id", m.id)}
                      <SubmitButton pendingText="Sending…">Send questionnaire reminder</SubmitButton>
                    </ActionForm>
                    {status === "sent" ? (
                      <ActionForm action={resendAction}>
                        {gid}
                        {hidden("member_id", m.id)}
                        <SubmitButton pendingText="Sending…">Resend match email</SubmitButton>
                      </ActionForm>
                    ) : null}
                    {m.role !== "organizer" ? (
                      <ActionForm
                        action={removePersonAction}
                        confirm={
                          status === "sent"
                            ? `Remove ${m.display_name}? Whoever was buying for them gets a new match by email.`
                            : `Remove ${m.display_name}?`
                        }
                      >
                        {gid}
                        {hidden("member_id", m.id)}
                        <SubmitButton className="danger">Remove</SubmitButton>
                      </ActionForm>
                    ) : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>

        <h3>Add a person</h3>
        <ActionForm action={addPersonAction} className="stack compact">
          {gid}
          <div className="row">
            <label>
              Name
              <input name="name" required maxLength={80} autoComplete="off" />
            </label>
            <label>
              Email
              <input name="email" type="email" required autoComplete="off" />
            </label>
            <label>
              Phone (optional)
              <input name="phone" type="tel" autoComplete="off" />
            </label>
          </div>
          <SubmitButton className="primary" pendingText="Adding…">
            Add person
          </SubmitButton>
        </ActionForm>
      </section>

      {/* 3: match */}
      <section className="card">
        <h2>2. Match</h2>
        {status === "draft" ? (
          <p className="muted">Pairs everyone up following your rules. You won&apos;t see who got whom, and nothing is sent yet.</p>
        ) : status === "matched" ? (
          <p>
            <strong>{members.length} people matched ✓</strong> Not sent yet. You can re-match as many times as you like.
          </p>
        ) : (
          <p className="muted">
            Matches were sent. Re-matching gives everyone a new match; you&apos;ll then need to press Send again.
          </p>
        )}
        <ActionForm
          action={matchAction}
          confirm={status === "sent" ? "Re-match everyone? Everyone's current match will be replaced and you'll need to send again." : undefined}
        >
          {gid}
          {status === "sent" ? hidden("confirmed", "1") : null}
          <SubmitButton className={status === "draft" ? "primary big" : ""} pendingText="Matching…">
            {status === "draft" ? "Match everyone" : "Re-match"}
          </SubmitButton>
        </ActionForm>
      </section>

      {/* 4: send */}
      <section className="card">
        <h2>3. Send</h2>
        {status === "sent" ? (
          <p>
            <strong>Sent ✓</strong>{" "}
            {group.sent_at ? <LocalTime iso={group.sent_at as string} /> : null}.
            Everyone got an email with who they&apos;re buying for and a link to fill out their questionnaire.
          </p>
        ) : (
          <>
            <p className="muted">
              Emails everyone their match plus a link to fill out their own questionnaire. Questionnaires don&apos;t need to
              be done first.
            </p>
            <ActionForm action={sendAction} confirm={`Send match emails to all ${members.length} people now?`}>
              {gid}
              {status === "matched" ? (
                <SubmitButton className="primary big" pendingText="Sending…">
                  Send to everyone
                </SubmitButton>
              ) : (
                <button type="button" className="big" disabled>
                  Send to everyone (match first)
                </button>
              )}
            </ActionForm>
          </>
        )}
      </section>

      {/* Notifications */}
      <section className="card">
        <h2>Notifications</h2>

        <h3>Remind people to fill out their questionnaire</h3>
        <p className="muted">
          {notDone === 0
            ? "Everyone has filled out their questionnaire 🎉"
            : `${notDone} of ${members.length} haven't finished. People reminded in the last ${REMINDER_COOLDOWN_MS / 3600000} hours are skipped unless you tick the box.`}
        </p>
        {notDone > 0 ? (
          <ActionForm action={remindAction} className="stack compact" confirm="Send these reminder emails now?">
            {gid}
            <label>
              Who
              <select name="audience" defaultValue="not_done">
                {Object.entries(REMINDER_AUDIENCES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Add a note (optional)
              <textarea name="note" rows={2} maxLength={500} placeholder="e.g. Please finish by Sunday so we can all shop!" />
            </label>
            <label className="small check">
              <input type="checkbox" name="include_recent" /> Include people reminded recently
              {notDone !== notDoneFresh ? ` (${notDone - notDoneFresh} right now)` : ""}
            </label>
            <SubmitButton pendingText="Sending…">Send reminders</SubmitButton>
          </ActionForm>
        ) : null}

        <h3>Send the match emails again</h3>
        {status === "sent" ? (
          <>
            <p className="muted">
              For anyone who lost their email or never got it. Each person gets a fresh link to their own match.
              {needsResend ? ` ${needsResend} ${needsResend === 1 ? "email" : "emails"} failed or never went out.` : ""}
              {notSignedIn ? ` ${notSignedIn} ${notSignedIn === 1 ? "person hasn't" : "people haven't"} opened their link yet.` : ""}
            </p>
            <ActionForm action={resendAllAction} className="stack compact" confirm="Resend match emails to the people you picked?">
              {gid}
              <label>
                Who
                <select name="audience" defaultValue={needsResend ? "undelivered" : notSignedIn ? "not_signed_in" : "everyone"}>
                  {Object.entries(RESEND_AUDIENCES).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <SubmitButton pendingText="Sending…">Resend match emails</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <p className="muted">Available after you press Send.</p>
        )}

        <h3>Announcement to everyone</h3>
        <p className="muted">Your own message, for things like &ldquo;exchange is moved to Saturday.&rdquo; It never includes anyone&apos;s match.</p>
        <ActionForm action={announceAction} className="stack compact" confirm={`Email this to all ${members.length} people now?`}>
          {gid}
          <label>
            Subject
            <input name="subject" required maxLength={100} autoComplete="off" />
          </label>
          <label>
            Message
            <textarea name="message" rows={4} required maxLength={2000} />
          </label>
          <div className="row actions">
            <SubmitButton name="intent" value="test" skipConfirm pendingText="Sending…">
              Send me a test copy
            </SubmitButton>
            <SubmitButton className="primary" name="intent" value="send" pendingText="Sending…">
              Send to everyone
            </SubmitButton>
          </div>
        </ActionForm>
      </section>

      {/* Activity */}
      <section className="card">
        <details>
          <summary>
            <h2 className="inline-heading">Recent activity</h2>
          </summary>
          {activity && activity.length ? (
            <ul className="activity">
              {activity.map((a) => (
                <li key={a.id as number}>
                  <span>{describeAudit(a.action as string, (a.details ?? {}) as Record<string, unknown>)}</span>
                  <span className="muted small">
                    {a.actor_user_id ? `${actorName.get(a.actor_user_id as string) ?? "An organizer"} · ` : "Automatic · "}
                    <LocalTime iso={a.created_at as string} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nothing yet.</p>
          )}
        </details>
      </section>

      {/* Settings */}
      <section className="card">
        <details>
          <summary>
            <h2 className="inline-heading">Settings</h2>
          </summary>
          <ActionForm action={settingsAction} className="stack compact">
            {gid}
            <label>
              Group name
              <input name="name" defaultValue={group.name} required maxLength={100} />
            </label>
            <div className="row">
              <label>
                Budget from ($)
                <input name="budget_min" type="number" min={0} step={1} defaultValue={group.budget_min_cents / 100} />
              </label>
              <label>
                to ($)
                <input name="budget_max" type="number" min={0} step={1} defaultValue={group.budget_max_cents / 100} />
              </label>
              <label>
                Exchange date
                <input name="exchange_date" type="date" defaultValue={group.exchange_date ?? ""} />
              </label>
            </div>
            <SubmitButton>Save settings</SubmitButton>
          </ActionForm>
        </details>
      </section>
    </main>
  );
}
