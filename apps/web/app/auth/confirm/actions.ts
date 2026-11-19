"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deadLinkOutcome, safeNext } from "@/lib/auth";
import { emailLinkKey } from "@/lib/links";
import { readLinkToken } from "@/lib/link-token";

const TYPES: EmailOtpType[] = ["magiclink", "email", "signup", "invite"];

export async function confirmSignIn(formData: FormData) {
  const link = String(formData.get("link") ?? "");
  const next = safeNext(formData.get("next"));
  const supabase = await createUserClient();

  // Links in our own emails (lib/links.ts): reusable until they expire.
  let tokenHash = String(formData.get("token_hash") ?? "");
  let type: EmailOtpType;
  let email = String(formData.get("email") ?? "");
  if (link) {
    const token = readLinkToken(link, emailLinkKey());
    if (token) email = token.email;
    if (!token || token.expired) return goOrExpired(supabase, email, next);
    // Mint a one-time Supabase token for this person and use it straight away.
    const { data, error } = await createAdminClient().auth.admin.generateLink({ type: "magiclink", email: token.email });
    if (error) {
      console.error("confirmSignIn generateLink", error);
      return goOrExpired(supabase, email, next);
    }
    tokenHash = data.properties.hashed_token;
    type = "magiclink";
  } else {
    // Links from the sign-in form (Supabase's own email): one-time.
    const rawType = String(formData.get("type") ?? "email") as EmailOtpType;
    type = TYPES.includes(rawType) ? rawType : "email";
  }

  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) return goOrExpired(supabase, email, next);
  await supabase.rpc("claim_memberships");
  redirect(next);
}

/** The link didn't work. Someone already signed in as its owner is fine; anyone else gets a fresh link offer. */
async function goOrExpired(supabase: Awaited<ReturnType<typeof createUserClient>>, email: string, next: string): Promise<never> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (deadLinkOutcome(user?.email, email) === "go") {
    await supabase.rpc("claim_memberships");
    redirect(next);
  }
  const params = new URLSearchParams({ expired: "1", next });
  if (email) params.set("email", email);
  redirect(`/login?${params}`);
}
