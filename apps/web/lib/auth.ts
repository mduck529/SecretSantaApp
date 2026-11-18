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

const SAFE_NEXT_ORIGIN = "https://same-site.invalid";

/**
 * Only allow same-site relative redirects (a path such as `/g/123?x=1#match`).
 *
 * Browsers are forgiving when they read a Location header: they treat `\` as `/`, drop tabs
 * and newlines anywhere, and trim spaces and control characters at the ends. So `/\evil.com`
 * and `/<tab>/evil.com` both land on `https://evil.com/`. Rather than list every trick, this
 * refuses any backslash, whitespace or control character, then double-checks with the
 * WHATWG URL parser (the one browsers use) that the result stays on our own site.
 * Percent-encoded forms such as `/%5Cevil.com` are left alone: they stay on our site.
 */
export function safeNext(next: unknown, fallback = "/home"): string {
  if (typeof next !== "string" || next.length > 2048) return fallback;
  // One leading slash, then anything but a second slash or a backslash.
  if (!/^\/(?![/\\])/.test(next)) return fallback;
  // Backslashes, any whitespace (tab, newline, no-break space, line separators, BOM) and
  // control characters (C0, DEL, C1) are never needed in our paths.
  if (/[\\\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u2064\ufeff]/.test(next)) return fallback;
  let url: URL;
  try {
    url = new URL(next, SAFE_NEXT_ORIGIN);
  } catch {
    return fallback;
  }
  // Belt and braces: must resolve to our own origin, and not to a path that starts with
  // `//` (for example `/.//evil.com`), which another layer might later normalize to `//evil.com`.
  if (url.origin !== SAFE_NEXT_ORIGIN || url.pathname.startsWith("//")) return fallback;
  return next;
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
