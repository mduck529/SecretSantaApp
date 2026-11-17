import type { Answers, GiftIdeas } from "@santa/core";
import { PersonView } from "@/components/person-view";
import { requireMember } from "@/lib/auth";
import { familyPhoto } from "@/lib/family-photo";
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
  let giftee: { id: string; name: string; answers: Answers | null; ideas: GiftIdeas | null } | null = null;
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
      giftee = {
        id: match.receiver_id as string,
        name: person?.display_name ?? "your giftee",
        answers: (theirs?.answers as Answers) ?? null,
        ideas: (cached?.ideas as GiftIdeas) ?? null,
      };
    }
  }

  // After the organizer reveals, Row Level Security lets every member read all matches.
  let pairs: { id: string; giver: string; receiver: string }[] | null = null;
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

  return (
    <PersonView
      groupId={groupId}
      groupName={group.name}
      myName={membership.display_name}
      isAdmin={isAdmin}
      budget={groupBudget(group)}
      dateLabel={formatExchangeDate(group.exchange_date)}
      exchangeDate={group.exchange_date}
      photo={familyPhoto}
      giftee={giftee}
      revealed={pairs}
      mine={{ answers: (mine?.answers as Answers) ?? {}, complete: Boolean(mine?.is_complete) }}
      saveAction={saveQuestionnaire}
    />
  );
}
