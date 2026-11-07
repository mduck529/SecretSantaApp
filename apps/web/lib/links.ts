import "server-only";
import { createAdminClient } from "./supabase/admin";
import { serverEnv } from "./env";

/**
 * A one-click sign-in link for emails. Opens a "Continue" page first so email
 * link scanners can't use up the one-time token. If it has expired, that page
 * offers to send a fresh link.
 */
export async function signInLink(email: string, nextPath: string): Promise<string> {
  const db = createAdminClient();
  // Make sure an account exists (no-op if it does).
  const { error: createError } = await db.auth.admin.createUser({ email, email_confirm: true });
  if (createError && createError.code !== "email_exists" && !/already/i.test(createError.message)) {
    throw createError;
  }
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const params = new URLSearchParams({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
    next: nextPath,
    email,
  });
  return `${serverEnv.appUrl()}/auth/confirm?${params}`;
}
