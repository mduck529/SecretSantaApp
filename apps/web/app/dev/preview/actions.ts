"use server";

import type { ActionState } from "@/components/action-form";

/** Stand-in for saveQuestionnaire on the dev preview page. Saves nothing. */
export async function previewSave(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (process.env.NODE_ENV === "production") return { ok: false, message: "Not available." };
  const complete = ["hobbies", "loves", "please_no"].every((k) => String(formData.get(k) ?? "").trim());
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, complete, message: "Saved (preview only)" };
}
