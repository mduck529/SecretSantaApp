"use server";

import { createUserClient } from "@/lib/supabase/server";
import { serverEnv } from "@/lib/env";
import { canCreateGroups, safeNext } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/components/action-form";

export async function sendLoginLink(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "Please enter a valid email address." };
  const next = safeNext(formData.get("next"));
  const sent = { ok: true, message: `Check ${email} for a sign-in link. It can take a minute to arrive.` };

  // Only organizers and people someone has added get an email, so this form can't be
  // used to email strangers. The reply is the same either way.
  const admin = createAdminClient();
  if (!canCreateGroups(email)) {
    const { data: onRoster, error: rosterError } = await admin.from("memberships").select("id").eq("email", email).limit(1);
    if (rosterError) {
      console.error("sendLoginLink roster check", rosterError);
      return { ok: false, message: "We couldn't send the email. Please try again in a minute." };
    }
    if (!onRoster.length) return sent;
  }
  // Make sure an account exists (no-op if it does); sign-up from the form itself is off.
  const { error: createError } = await admin.auth.admin.createUser({ email, email_confirm: true });
  if (createError && createError.code !== "email_exists" && !/already/i.test(createError.message)) {
    console.error("sendLoginLink createUser", createError);
    return { ok: false, message: "We couldn't send the email. Please try again in a minute." };
  }

  const supabase = await createUserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${serverEnv.appUrl()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    console.error("signInWithOtp", error);
    return { ok: false, message: "We couldn't send the email. Please try again in a minute." };
  }
  return sent;
}
