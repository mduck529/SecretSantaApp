"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { cleanAnswers, isComplete } from "@santa/core";
import { requireMember } from "@/lib/auth";
import { deliverProfileUpdates } from "@/lib/group-service";
import type { ActionState } from "@/components/action-form";

export async function saveQuestionnaire(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const groupId = String(formData.get("group_id") ?? "");
  const { supabase, membership } = await requireMember(groupId);

  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) if (typeof value === "string") raw[key] = value;
  const answers = cleanAnswers(raw);
  const complete = isComplete(answers);

  // Row Level Security only lets people write their own answers. Members may update only
  // answers and is_complete, so this is an UPDATE with an INSERT fallback, not an upsert
  // (an upsert also sets membership_id, which Postgres refuses).
  const row = { answers, is_complete: complete };
  const update = () =>
    supabase.from("questionnaire_answers").update(row).eq("membership_id", membership.id).select("membership_id");
  const first = await update();
  let error = first.error;
  if (!error && !first.data?.length) {
    ({ error } = await supabase.from("questionnaire_answers").insert({ membership_id: membership.id, ...row }));
    // Two saves at once (two tabs): the other one inserted first, so update theirs instead.
    if (error?.code === "23505") ({ error } = await update());
  }
  if (error) {
    console.error("saveQuestionnaire", error);
    return { ok: false, message: "Couldn't save. Please try again." };
  }

  // Let their Secret Santa know (throttled), after the response is sent.
  after(async () => {
    try {
      await deliverProfileUpdates();
    } catch (err) {
      console.error("deliverProfileUpdates", err);
    }
  });
  revalidatePath(`/g/${groupId}`);
  return {
    ok: true,
    message: complete
      ? "Saved ✓ Your Secret Santa will get a heads-up. You can come back and change this anytime."
      : "Saved ✓ Fill in the starred questions when you can, so your Santa has the basics.",
  };
}
