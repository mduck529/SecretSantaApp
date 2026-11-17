import { AdminView, type AdminMember } from "@/components/admin-view";
import { requireAdmin } from "@/lib/auth";
import { formatExchangeDate, groupBudget } from "@/lib/group-service";

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

  return (
    <AdminView
      groupId={groupId}
      group={{
        name: group.name,
        status: group.status as "draft" | "matched" | "sent",
        budget: groupBudget(group),
        dateLabel: formatExchangeDate(group.exchange_date),
        budget_min_cents: group.budget_min_cents,
        budget_max_cents: group.budget_max_cents,
        exchange_date: group.exchange_date,
        sent_at: group.sent_at,
      }}
      members={members as AdminMember[]}
      phones={Object.fromEntries((contacts ?? []).map((c) => [c.membership_id as string, c.phone as string]))}
      rules={(rules ?? []) as AdminViewRule[]}
    />
  );
}

type AdminViewRule = { id: string; a_id: string; b_id: string; two_way: boolean };
