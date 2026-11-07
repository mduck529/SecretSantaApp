import Link from "next/link";
import type { Answers } from "@santa/core";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AnswersView, QuestionnaireFields } from "@/components/questionnaire";
import { requireMember } from "@/lib/auth";
import { formatExchangeDate, groupBudget } from "@/lib/group-service";
import { saveQuestionnaire } from "./actions";

export const metadata = { title: "My Secret Santa" };

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params;
  const { supabase, membership, isAdmin } = await requireMember(groupId);

  const { data: group } = await supabase
    .from("groups")
    .select("name, status, budget_min_cents, budget_max_cents, exchange_date")
    .eq("id", groupId)
    .single();
  if (!group) return null;

  const { data: mine } = await supabase
    .from("questionnaire_answers")
    .select("answers, is_complete")
    .eq("membership_id", membership.id)
    .maybeSingle();

  // Only after the organizer presses Send. RLS returns only this person's own match.
  let giftee: { name: string; answers: Answers | null } | null = null;
  if (group.status === "sent") {
    const { data: match } = await supabase
      .from("assignments")
      .select("receiver_id")
      .eq("giver_id", membership.id)
      .maybeSingle();
    if (match) {
      const [{ data: person }, { data: theirs }] = await Promise.all([
        supabase.from("memberships").select("display_name").eq("id", match.receiver_id).single(),
        supabase.from("questionnaire_answers").select("answers").eq("membership_id", match.receiver_id).maybeSingle(),
      ]);
      giftee = { name: person?.display_name ?? "your giftee", answers: (theirs?.answers as Answers) ?? null };
    }
  }

  const budget = groupBudget(group);
  const date = formatExchangeDate(group.exchange_date);
  const hasGifteeAnswers = giftee?.answers && Object.keys(giftee.answers).length > 0;

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">{group.name}</p>
          <h1>Hi {membership.display_name.split(" ")[0]} 👋</h1>
        </div>
        {isAdmin ? (
          <Link className="button" href={`/g/${groupId}/admin`}>
            Organizer tools
          </Link>
        ) : null}
      </header>

      <section id="match" className="card match">
        {giftee ? (
          <>
            <p className="eyebrow">You&apos;re buying for</p>
            <h2 className="giftee">{giftee.name}</h2>
            <p>
              Budget <strong>{budget}</strong>
              {date ? (
                <>
                  {" "}
                  · Exchange <strong>{date}</strong>
                </>
              ) : null}
            </p>
            {hasGifteeAnswers ? (
              <AnswersView answers={giftee.answers!} />
            ) : (
              <p className="muted">
                {giftee.name} hasn&apos;t filled out their questionnaire yet. We&apos;ll email you as soon as they do.
              </p>
            )}
            <div className="ideas">
              <h3>Gift ideas</h3>
              <p className="muted">Personalized gift ideas (things to buy and things to make) are coming soon.</p>
            </div>
          </>
        ) : (
          <>
            <h2>Your match is on its way</h2>
            <p className="muted">
              You&apos;ll get an email when names are drawn. In the meantime, fill out your questionnaire below so your
              Secret Santa knows what you&apos;d love.
            </p>
          </>
        )}
      </section>

      <section id="questionnaire" className="card">
        <h2>Your questionnaire</h2>
        <p className="muted">
          Only your Secret Santa can see this. {mine?.is_complete ? "You can update it anytime." : "It takes about 5 minutes."}
        </p>
        <ActionForm action={saveQuestionnaire} className="stack">
          <input type="hidden" name="group_id" value={groupId} />
          <QuestionnaireFields answers={(mine?.answers as Answers) ?? {}} />
          <SubmitButton className="primary" pendingText="Saving…">
            Save my answers
          </SubmitButton>
        </ActionForm>
      </section>

      <form action="/auth/signout" method="post" className="footer">
        <button type="submit" className="link">
          Sign out
        </button>
      </form>
    </main>
  );
}
