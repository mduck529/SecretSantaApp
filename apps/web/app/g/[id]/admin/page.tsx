import { AdminView, type AdminMember } from "@/components/admin-view";
import { requireAdmin } from "@/lib/auth";
import { formatExchangeDate, groupBudget } from "@/lib/group-service";
import { describeAudit } from "@/lib/audit-labels";
import { loadProgress } from "@/lib/notify-service";
import { ADMIN_MEMBER_COLUMNS } from "@/lib/admin-columns";

export const metadata = { title: "Organizer · Secret Santa" };

// Send emails everyone one at a time; give it room.
export const maxDuration = 60;

/**
 * Organizer page. Everything here is read through Row Level Security as the organizer,
 * who can't read anyone's match or answers, so this page cannot show pairings.
 */
export default async function AdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: groupId } = await params;
  const { supabase, user } = await requireAdmin(groupId);

  const [{ data: group }, { data: members }, { data: contacts }, { data: rules }, { data: log }] = await Promise.all([
    supabase
      .from("groups")
      .select("name, status, budget_min_cents, budget_max_cents, exchange_date, sent_at, revealed_at")
      .eq("id", groupId)
      .single(),
    supabase
      .from("memberships")
      .select(ADMIN_MEMBER_COLUMNS)
      .eq("group_id", groupId)
      .order("created_at"),
    supabase.from("member_contacts").select("membership_id, phone"),
    supabase.from("exclusion_rules").select("id, a_id, b_id, two_way").eq("group_id", groupId),
    // Admins can read the group's audit log through RLS. It never holds pairings.
    supabase
      .from("audit_log")
      .select("id, action, details, actor_user_id, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  if (!group || !members) return null;
  const progress = await loadProgress(groupId, user.id);

  const actorName = new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m.display_name as string]));
  const activity = (log ?? []).map((a) => ({
    id: a.id as number,
    label: describeAudit(a.action as string, (a.details ?? {}) as Record<string, unknown>),
    actor: a.actor_user_id ? (actorName.get(a.actor_user_id as string) ?? "An organizer") : "Automatic",
    at: a.created_at as string,
  }));

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
        revealed_at: group.revealed_at,
      }}
      members={(members as unknown as Omit<AdminMember, "questionnaire_updated_at" | "last_reminded_at">[]).map((m) => ({
        ...m,
        questionnaire_updated_at: progress[m.id]?.questionnaire_updated_at ?? null,
        last_reminded_at: progress[m.id]?.last_reminded_at ?? null,
      }))}
      phones={Object.fromEntries((contacts ?? []).map((c) => [c.membership_id as string, c.phone as string]))}
      rules={(rules ?? []) as AdminViewRule[]}
      activity={activity}
    />
  );
}

type AdminViewRule = { id: string; a_id: string; b_id: string; two_way: boolean };
