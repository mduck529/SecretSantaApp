"use server";

import { redirect } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createUserClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth";

const TYPES: EmailOtpType[] = ["magiclink", "email", "signup", "invite"];

export async function confirmSignIn(formData: FormData) {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const rawType = String(formData.get("type") ?? "email") as EmailOtpType;
  const type = TYPES.includes(rawType) ? rawType : "email";
  const next = safeNext(formData.get("next"));
  const email = String(formData.get("email") ?? "");

  const supabase = await createUserClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    const params = new URLSearchParams({ expired: "1", next });
    if (email) params.set("email", email);
    redirect(`/login?${params}`);
  }
  await supabase.rpc("claim_memberships");
  redirect(next);
}
