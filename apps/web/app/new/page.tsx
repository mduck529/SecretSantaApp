import { ActionForm, SubmitButton } from "@/components/action-form";
import { canCreateGroups, requireUser } from "@/lib/auth";
import { createGroup } from "./actions";

export const metadata = { title: "New group · Secret Santa" };

export default async function NewGroupPage() {
  const { user } = await requireUser("/new");
  if (!canCreateGroups(user.email)) {
    return (
      <main className="narrow">
        <h1>Start a Secret Santa</h1>
        <p>Only the organizer can start a group here. If someone added you to theirs, use the link in their email.</p>
      </main>
    );
  }
  return (
    <main className="narrow">
      <h1>Start a Secret Santa</h1>
      <ActionForm action={createGroup} className="stack">
        <label>
          Group name
          <input name="name" required maxLength={100} placeholder="Family Christmas 2026" />
        </label>
        <label>
          Your name (you&apos;re taking part too)
          <input name="my_name" required maxLength={80} />
        </label>
        <div className="row">
          <label>
            Budget from ($)
            <input name="budget_min" type="number" min={0} step={1} defaultValue={100} required />
          </label>
          <label>
            to ($)
            <input name="budget_max" type="number" min={0} step={1} defaultValue={150} required />
          </label>
        </div>
        <label>
          Gift exchange date (optional)
          <input name="exchange_date" type="date" />
        </label>
        <SubmitButton className="primary" pendingText="Creating…">
          Create group
        </SubmitButton>
      </ActionForm>
    </main>
  );
}
