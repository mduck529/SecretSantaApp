"use server";

import { createUserClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { safeNext } from "@/lib/auth";
import type { ActionState } from "@/components/action-form";

export async function sendLoginLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Please enter a valid email address." };
  const next = safeNext(formData.get("next"));
  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${serverEnv.appUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signInWithOtp", error);
    return { ok: false, message: "We couldn't send the email. Please try again in a minute." };
  }
  return { ok: true, message: `Check ${email} for a sign-in link. It can take a minute to arrive.` };
}
