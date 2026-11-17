import Link from "next/link";
import { ActionForm, SubmitButton } from "./action-form";
import { Ornament } from "./festive/ornament";
import { Wreath } from "./festive/wreath";
import {
  addPersonAction,
  addRuleAction,
  matchAction,
  remindAction,
  removePersonAction,
  removeRuleAction,
  resendAction,
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
  };
  members: AdminMember[];
  phones: Record<string, string>;
  rules: { id: string; a_id: string; b_id: string; two_way: boolean }[];
}

/**
 * The organizer's "Santa's Workshop". Receives only data the organizer may see
 * through Row Level Security (no matches, no answers), so it cannot show pairings.
 */
export function AdminView({ groupId, group, members, phones, rules }: AdminViewProps) {
  const nameOf = new Map(members.map((m) => [m.id, m.display_name]));
  const status = group.status;
  const done = members.filter((m) => m.questionnaire_complete).length;
  const incomplete = members.length - done;
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
                  </div>
                  <div className="badges">
                    <span className={m.user_id ? "badge yes" : "badge"}>{m.user_id ? "✓ Signed in" : "Not signed in"}</span>
                    <span className={m.questionnaire_complete ? "badge yes" : "badge"}>
                      {m.questionnaire_complete ? "✓ Questionnaire" : "No questionnaire"}
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
            {group.sent_at ? new Date(group.sent_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""}.
            Everyone got an email with who they&apos;re buying for and a link to fill out their questionnaire.
          </p>
        ) : (
          <>
            <p className="muted">
              Emails everyone their match plus a link to fill out their own questionnaire. Questionnaires don&apos;t need to
              be done first.
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
          {incomplete > 0 ? (
            <ActionForm action={remindAction} confirm={`Email a reminder to the ${incomplete} people who haven't filled theirs out?`}>
              {gid}
              <SubmitButton pendingText="Sending…">Remind everyone who hasn&apos;t</SubmitButton>
            </ActionForm>
          ) : null}
        </div>
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
