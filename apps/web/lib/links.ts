import "server-only";
import { createAdminClient } from "./supabase/admin";
import { serverEnv } from "./env";
import { createLinkToken, linkKey } from "./link-token";

/** The key that signs the sign-in links in our emails. */
export function emailLinkKey(): Buffer {
  return linkKey(serverEnv.emailLinkSecret());
}

/**
 * A one-click sign-in link for emails. It keeps working until it expires
 * (LINK_TTL_SECONDS), however many times it's opened and however many newer
 * emails the person gets. It opens a "Continue" page first, so email link
 * scanners that open links automatically never sign anyone in.
 */
export async function signInLink(email: string, nextPath: string): Promise<string> {
  const db = createAdminClient();
  // Make sure an account exists (no-op if it does).
  const { error: createError } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createError && createError.code !== "email_exists" && !/already/i.test(createError.message)) {
    throw createError;
  }
  const params = new URLSearchParams({ link: createLinkToken(email, emailLinkKey()), next: nextPath });
  return `${serverEnv.appUrl()}/auth/confirm?${params}`;
}
