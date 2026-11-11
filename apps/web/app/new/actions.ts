"use server";

import { redirect } from "next/navigation";
import { canCreateGroups, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/components/action-form";

export async function createGroup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { user } = await requireUser("/new");
  if (!user.email || !canCreateGroups(user.email)) {
    return { ok: false, message: "Only the organizer can start a group here." };
  }
  const name = String(formData.get("name") ?? "").trim();
  const myName = String(formData.get("my_name") ?? "").trim();
  const min = Math.round(Number(formData.get("budget_min") ?? 100) * 100);
  const max = Math.round(Number(formData.get("budget_max") ?? 150) * 100);
  const date = String(formData.get("exchange_date") ?? "").trim() || null;
  if (!name || !myName) return { ok: false, message: "Please fill in the group name and your name." };
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    return { ok: false, message: "Budget: the maximum must be at least the minimum." };
  }
  // The owner comes from the verified session, never from the form.
  const { data, error } = await createAdminClient().rpc("create_group_as", {
    owner_id: user.id,
    owner_email: user.email,
    group_name: name,
    organizer_name: myName,
    budget_min: min,
    budget_max: max,
    exchange: date,
  });
  if (error) {
    console.error("create_group_as", error);
    return { ok: false, message: "Couldn't create the group. Please try again." };
  }
  redirect(`/g/${data}/admin`);
}
