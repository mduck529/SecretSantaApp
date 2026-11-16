import Link from "next/link";
import type { Answers, GiftIdeas } from "@santa/core";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { GiftIdeasPanel } from "@/components/gift-ideas";
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
    .select("name, status, budget_min_cents, budget_max_cents, exchange_date, revealed_at")
    .eq("id", groupId)
    .single();
  if (!group) return null;

  const { data: mine } = await supabase
    .from("questionnaire_answers")
    .select("answers, is_complete")
    .eq("membership_id", membership.id)
    .maybeSingle();

  // Only after the organizer presses Send. RLS returns only this person's own match.
  let giftee: { name: string; answers: Answers | null; ideas: GiftIdeas | null } | null = null;
  if (group.status === "sent") {
    const { data: match } = await supabase
      .from("assignments")
      .select("receiver_id")
      .eq("giver_id", membership.id)
      .maybeSingle();
    if (match) {
      const [{ data: person }, { data: theirs }, { data: cached }] = await Promise.all([
        supabase.from("memberships").select("display_name").eq("id", match.receiver_id).single(),
        supabase.from("questionnaire_answers").select("answers").eq("membership_id", match.receiver_id).maybeSingle(),
        // The signed-in client, not the service role: RLS shows this row only to the current Santa.
        supabase.from("gift_suggestions").select("ideas").eq("receiver_id", match.receiver_id).maybeSingle(),
      ]);
      giftee = { name: person?.display_name ?? "your giftee", answers: (theirs?.answers as Answers) ?? null,
        ideas: (cached?.ideas as GiftIdeas) ?? null,
      };
    }
  }

  // After the organizer reveals, Row Level Security lets every member read all matches.
  let pairs: { id: string; giver: string; receiver: string }[] = [];
  if (group.revealed_at) {
    const [{ data: all }, { data: people }] = await Promise.all([
      supabase.from("assignments").select("giver_id, receiver_id").eq("group_id", groupId),
      supabase.from("memberships").select("id, display_name").eq("group_id", groupId),
    ]);
    const nameOf = new Map((people ?? []).map((p) => [p.id as string, p.display_name as string]));
    pairs = (all ?? [])
      .map((a) => ({ id: a.giver_id as string, giver: nameOf.get(a.giver_id) ?? "Someone", receiver: nameOf.get(a.receiver_id) ?? "someone" }))
      .sort((a, b) => a.giver.localeCompare(b.giver));
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
            <GiftIdeasPanel ideas={giftee.ideas} name={giftee.name} hasAnswers={!!hasGifteeAnswers} />
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

      {group.revealed_at ? (
        <section id="reveal" className="card">
          <h2>Who had whom 🎁</h2>
          <ul className="people">
            {pairs.map((p) => (
              <li key={p.id}>
                <strong>{p.giver}</strong> had {p.receiver}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
