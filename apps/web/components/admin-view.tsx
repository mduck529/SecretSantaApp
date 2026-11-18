import Link from "next/link";
import { ActionForm, SubmitButton } from "./action-form";
import { Ornament } from "./festive/ornament";
import { Wreath } from "./festive/wreath";
import { LocalTime } from "./local-time";
import { checkReveal } from "@/lib/reveal";
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
  revealAction,
  sendAction,
  settingsAction,
  updatePersonAction,
} from "@/app/g/[id]/admin/actions";

export interface AdminMember {
  id: string;
  display_name: string;
  email: string;
  role: string;
  user_id: string | null;
  questionnaire_complete: boolean;
  match_email_status: string | null;
  /** Read on the server (see loadProgress), not by the organizer's own login. */
  questionnaire_updated_at: string | null;
  last_reminded_at: string | null;
}

export interface AdminViewProps {
  groupId: string;
  group: {
    name: string;
    status: "draft" | "matched" | "sent";
    budget: string;
    dateLabel: string | null;
    budget_min_cents: number;
    budget_max_cents: number;
    exchange_date: string | null;
    sent_at: string | null;
    revealed_at: string | null;
  };
  members: AdminMember[];
  phones: Record<string, string>;
  rules: { id: string; a_id: string; b_id: string; two_way: boolean }[];
  /** Recent organizer actions, already worded. Never contains pairings. */
  activity: { id: number; label: string; actor: string; at: string }[];
}

/**
 * The organizer's "Santa's Workshop". Receives only data the organizer may see
 * through Row Level Security (no matches, no answers), so it cannot show pairings.
 */
export function AdminView({ groupId, group, members, phones, rules, activity }: AdminViewProps) {
  const nameOf = new Map(members.map((m) => [m.id, m.display_name]));
  const status = group.status;
  const reveal = checkReveal({ status, exchange_date: group.exchange_date, revealed_at: group.revealed_at });
  const done = members.filter((m) => m.questionnaire_complete).length;
  const incomplete = members.length - done;
  // Status columns only (no matches, no answers), so these can't hint at a pairing.
  const info = members as unknown as RecipientInfo[];
  const summary = summarize(info);
  const notDone = pickReminderTargets(info, "not_done", { includeRecent: true }).targets.length;
  const notDoneFresh = pickReminderTargets(info, "not_done").targets.length;
  const needsResend = pickResendTargets(info, "undelivered").length;
  const notSignedIn = pickResendTargets(info, "not_signed_in").length;
  const enough = members.length >= 3;
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;
  const gid = hidden("group_id", groupId);

  const steps = [
    { label: "Add people", state: enough ? "done" : "current" },
    { label: "Rules", state: enough ? "done" : "" },
    { label: "Match", state: status !== "draft" ? "done" : enough ? "current" : "" },
    { label: "Send", state: status === "sent" ? "done" : status === "matched" ? "current" : "" },
  ];

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">Santa&apos;s Workshop</p>
          <h1>{group.name}</h1>
          <p className="muted">
            Budget {group.budget}
            {group.dateLabel ? ` · ${group.dateLabel}` : ""}
          </p>
        </div>
        <Link className="button small-button" href={`/g/${groupId}`}>
          My page
        </Link>
      </header>

      <ol className="steps" aria-label="Progress">
        {steps.map((s) => (
          <li key={s.label} className={s.state || undefined} aria-current={s.state === "current" ? "step" : undefined}>
            <span className="bulb" aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ol>

      {status === "sent" ? (
        <section className="card" aria-label="Status">
          <p className="eyebrow">Where things stand</p>
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
        <p className="eyebrow">Step 1</p>
        <h2>People &amp; rules</h2>
        <p className="muted">
          {members.length} {members.length === 1 ? "person" : "people"}. Add a &ldquo;can&apos;t draw&rdquo; rule on anyone
          (couples, people who live together…). Rules go both ways unless you tick &ldquo;one way only&rdquo;.
        </p>
        <ul className="people">
          {members.map((m) => {
            const myRules = rules.filter((r) => r.a_id === m.id || r.b_id === m.id);
            const blocked = new Set(myRules.map((r) => (r.a_id === m.id ? r.b_id : r.a_id)));
            const options = members.filter((o) => o.id !== m.id && !blocked.has(o.id));
            return (
              <li key={m.id} className="person">
                <div className="person-head">
                  <Ornament name={m.display_name} />
                  <div className="person-id">
                    <strong>{m.display_name}</strong>
                    {m.role === "organizer" ? <span className="pill">organizer</span> : null}
                    <div className="muted small">
                      {m.email}
                      {phones[m.id] ? ` · ${phones[m.id]}` : ""}
                    </div>
                    {m.last_reminded_at ? (
                      <div className="muted small">
                        Reminded <LocalTime iso={m.last_reminded_at} />
                      </div>
                    ) : null}
                  </div>
                  <div className="badges">
                    <span className={m.user_id ? "badge yes" : "badge"}>{m.user_id ? "✓ Signed in" : "Not signed in"}</span>
                    <span className={m.questionnaire_complete ? "badge yes" : "badge"}>
                      {{ done: "✓ Questionnaire", started: "Questionnaire started", not_started: "No questionnaire" }[
                        questionnaireState(m as unknown as RecipientInfo)
                      ]}
                    </span>
                    {status === "sent" ? (
                      <span className={m.match_email_status === "failed" ? "badge no" : m.match_email_status === "sent" ? "badge yes" : "badge"}>
                        {m.match_email_status === "sent" ? "✓ Emailed" : m.match_email_status === "failed" ? "Email failed" : "Not emailed"}
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
                        <input name="phone" type="tel" defaultValue={phones[m.id] ?? ""} />
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

        <div className="add-person">
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
        </div>
      </section>

      {/* 3: match */}
      <section className="card hat-card">
        <div className="hat" aria-hidden="true">
          <span className="hat-cone" />
          <span className="hat-pom" />
          <span className="hat-brim" />
          {members.slice(0, 6).map((m, i) => (
            <span key={m.id} className="hat-slip" style={{ ["--i" as string]: i }}>
              {m.display_name.split(" ")[0]}
            </span>
          ))}
        </div>
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Draw names from the hat</h2>
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
            className="shake-form"
            confirm={status === "sent" ? "Re-match everyone? Everyone's current match will be replaced and you'll need to send again." : undefined}
          >
            {gid}
            {status === "sent" ? hidden("confirmed", "1") : null}
            <SubmitButton className={status === "draft" ? "primary big" : ""} pendingText="Shaking the hat…">
              {status === "draft" ? "Match everyone" : "Re-match"}
            </SubmitButton>
          </ActionForm>
        </div>
      </section>

      {/* 4: send */}
      <section className="card">
        <p className="eyebrow">Step 3</p>
        <h2>Send to everyone</h2>
        {status === "sent" ? (
          <p>
            <strong>Sent ✓</strong>{" "}
            {group.sent_at ? <LocalTime iso={group.sent_at} /> : null}.
            Everyone got an email inviting them to unwrap their match and fill out their questionnaire.
          </p>
        ) : (
          <>
            <p className="muted">
              Emails everyone a link to unwrap their match and fill out their own questionnaire. The email doesn&apos;t say
              who they have, and questionnaires don&apos;t need to be done first.
            </p>
            <ActionForm action={sendAction} celebrate confirm={`Send match emails to all ${members.length} people now?`}>
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

      {/* Reveal, after the exchange */}
      {status === "sent" ? (
        <section className="card">
          <p className="eyebrow">Step 4 · After the exchange</p>
          <h2>Reveal who had whom</h2>
          {group.revealed_at ? (
            <p>
              <strong>Revealed ✓</strong> Everyone can see who had whom on their page.
            </p>
          ) : (
            <>
              <p className="muted">
                After the exchange, show everyone who had whom. This can&apos;t be undone, and matches can&apos;t be
                changed afterwards. {reveal.ok ? "" : reveal.message}
              </p>
              <ActionForm action={revealAction} celebrate confirm="Reveal who had whom to everyone in the group? This can't be undone.">
                {gid}
                {reveal.ok ? (
                  <SubmitButton className="primary" pendingText="Revealing…">
                    Reveal who had whom
                  </SubmitButton>
                ) : (
                  <button type="button" disabled>
                    Reveal who had whom
                  </button>
                )}
              </ActionForm>
            </>
          )}
        </section>
      ) : null}

      {/* Reminders */}
      <section className="card reminders">
        <Wreath done={done} total={members.length} />
        <div>
          <p className="eyebrow">Questionnaires</p>
          <h2>{incomplete === 0 ? "Everyone's done" : `${done} of ${members.length} done`}</h2>
          <p className="muted">
            {incomplete === 0
              ? "Every Santa has what they need."
              : `${incomplete} ${incomplete === 1 ? "person hasn't" : "people haven't"} filled theirs out yet.`}
          </p>
        </div>
      </section>

      {/* Notifications */}
      <section className="card">
        <p className="eyebrow">Notifications</p>

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
          {activity.length ? (
            <ul className="activity">
              {activity.map((a) => (
                <li key={a.id}>
                  <span>{a.label}</span>
                  <span className="muted small">
                    {a.actor} · <LocalTime iso={a.at} />
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
