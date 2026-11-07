import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { requireAdmin } from "@/lib/auth";
import { formatExchangeDate, groupBudget } from "@/lib/group-service";
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
} from "./actions";

export const metadata = { title: "Organizer · Secret Santa" };

/**
 * Organizer page. Everything here is read through Row Level Security as the organizer,
 * who can't read anyone's match or answers, so this page cannot show pairings.
 */
export default async function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params;
  const { supabase } = await requireAdmin(groupId);

  const [{ data: group }, { data: members }, { data: contacts }, { data: rules }] = await Promise.all([
    supabase
      .from("groups")
      .select("name, status, budget_min_cents, budget_max_cents, exchange_date, sent_at")
      .eq("id", groupId)
      .single(),
    supabase
      .from("memberships")
      .select("id, display_name, email, role, user_id, questionnaire_complete, match_email_status")
      .eq("group_id", groupId)
      .order("created_at"),
    supabase.from("member_contacts").select("membership_id, phone"),
    supabase.from("exclusion_rules").select("id, a_id, b_id, two_way").eq("group_id", groupId),
  ]);
  if (!group || !members) return null;

  const phoneOf = new Map((contacts ?? []).map((c) => [c.membership_id as string, c.phone as string]));
  const nameOf = new Map(members.map((m) => [m.id as string, m.display_name as string]));
  const status = group.status as "draft" | "matched" | "sent";
  const incomplete = members.filter((m) => !m.questionnaire_complete).length;
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
                  </div>
                  <div className="badges">
                    <span className={m.user_id ? "badge yes" : "badge"}>{m.user_id ? "Signed in" : "Not signed in"}</span>
                    <span className={m.questionnaire_complete ? "badge yes" : "badge"}>
                      {m.questionnaire_complete ? "Questionnaire ✓" : "No questionnaire"}
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
            {group.sent_at ? new Date(group.sent_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : ""}.
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

      {/* Reminders */}
      <section className="card">
        <h2>Reminders</h2>
        <p className="muted">
          {incomplete === 0
            ? "Everyone has filled out their questionnaire 🎉"
            : `${incomplete} of ${members.length} haven't filled out their questionnaire yet.`}
        </p>
        {incomplete > 0 ? (
          <ActionForm action={remindAction} confirm={`Email a reminder to the ${incomplete} people who haven't filled theirs out?`}>
            {gid}
            <SubmitButton pendingText="Sending…">Remind everyone who hasn&apos;t filled it out</SubmitButton>
          </ActionForm>
        ) : null}
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
