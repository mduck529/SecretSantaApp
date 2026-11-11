import "server-only";
import { notFound, redirect } from "next/navigation";
import { createUserClient } from "./supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown): string {
  if (typeof value !== "string" || !UUID.test(value)) notFound();
  return value;
}

/** The signed-in user (verified with Supabase Auth), or a redirect to sign-in. */
export async function requireUser(next?: string) {
  const supabase = await createUserClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return { supabase, user };
}

/** The caller's membership in a group, or 404 if they aren't in it. */
export async function requireMember(groupId: string) {
  assertUuid(groupId);
  const ctx = await requireUser(`/g/${groupId}`);
  const { data: membership } = await ctx.supabase
    .from("memberships")
    .select("id, role, display_name, email")
    .eq("group_id", groupId)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  if (!membership) notFound();
  return {
    ...ctx,
    membership: membership as { id: string; role: string; display_name: string; email: string },
    isAdmin: membership.role === "organizer" || membership.role === "co_organizer",
  };
}

/** Like requireMember, but only for the organizer or a co-organizer. */
export async function requireAdmin(groupId: string) {
  const ctx = await requireMember(groupId);
  if (!ctx.isAdmin) notFound();
  return ctx;
}

/** Only allow same-site relative redirects. */
export function safeNext(next: unknown, fallback = "/home"): string {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/**
 * What to do when a sign-in link no longer works (links are one-time and expire).
 * If the person is already signed in as the address the link was sent to, let them
 * through; a link with no address on it accepts whoever is signed in.
 */
export function deadLinkOutcome(sessionEmail: string | null | undefined, linkEmail: string | null | undefined): "go" | "expired" {
  if (!sessionEmail) return "expired";
  const link = (linkEmail ?? "").trim().toLowerCase();
  return !link || link === sessionEmail.trim().toLowerCase() ? "go" : "expired";
}

/** Who may create groups: the comma-separated ORGANIZER_EMAILS list. Unset allows anyone outside production only. */
export function canCreateGroups(email: string | null | undefined, list = process.env.ORGANIZER_EMAILS, production = process.env.NODE_ENV === "production"): boolean {
  const allowed = (list ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return !production;
  return Boolean(email) && allowed.includes(email!.trim().toLowerCase());
}
