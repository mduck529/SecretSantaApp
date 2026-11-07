"use server";

import { revalidatePath } from "next/cache";
import { assertUuid, requireAdmin } from "@/lib/auth";
import * as svc from "@/lib/group-service";
import type { ActionState } from "@/components/action-form";

/**
 * Organizer actions. Each verifies the session user is an organizer of the group,
 * then calls the match-blind service. Results are messages and counts only.
 */
async function ctx(formData: FormData) {
  const groupId = assertUuid(formData.get("group_id"));
  const { user } = await requireAdmin(groupId);
  return { groupId, actor: user.id };
}

const str = (formData: FormData, key: string) => String(formData.get(key) ?? "");

async function done(groupId: string, outcome: svc.Outcome): Promise<ActionState> {
  revalidatePath(`/g/${groupId}/admin`);
  return outcome;
}

export async function addPersonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.addMember(groupId, actor, { name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") }));
}

export async function updatePersonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  const memberId = assertUuid(fd.get("member_id"));
  return done(
    groupId,
    await svc.updateMember(groupId, actor, memberId, { name: str(fd, "name"), email: str(fd, "email"), phone: str(fd, "phone") }),
  );
}

export async function removePersonAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.removeMember(groupId, actor, assertUuid(fd.get("member_id"))));
}

export async function addRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  const other = str(fd, "other_id");
  if (!other) return { ok: false, message: "Pick who they can't draw." };
  return done(groupId, await svc.addRule(groupId, actor, str(fd, "member_id"), other, fd.get("one_way") !== "on"));
}

export async function removeRuleAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.removeRule(groupId, actor, assertUuid(fd.get("rule_id"))));
}

export async function matchAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.matchGroup(groupId, actor, { confirmedAfterSend: fd.get("confirmed") === "1" }));
}

export async function sendAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.sendAllMatches(groupId, actor));
}

export async function resendAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(groupId, await svc.resendMatch(groupId, actor, assertUuid(fd.get("member_id"))));
}

export async function remindAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  const memberId = fd.get("member_id");
  return done(groupId, await svc.sendReminders(groupId, actor, memberId ? assertUuid(memberId) : null));
}

export async function settingsAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const { groupId, actor } = await ctx(fd);
  return done(
    groupId,
    await svc.updateSettings(groupId, actor, {
      name: str(fd, "name"),
      budgetMin: str(fd, "budget_min"),
      budgetMax: str(fd, "budget_max"),
      exchangeDate: str(fd, "exchange_date"),
    }),
  );
}
