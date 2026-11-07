import "server-only";
import { draw, rulesToExclusions, validateAssignments, type DrawProblem } from "@santa/core";
import { createAdminClient } from "./supabase/admin";

/**
 * What the organizer's screen gets back from a draw. Deliberately contains
 * counts only, never who has whom, because the organizer is also a participant.
 */
export type DrawOutcome =
  | { ok: true; matched: number; singleLoop: boolean }
  | { ok: false; message: string };

/**
 * The organizer's "Match" button. Makes (or remakes) the matches but sends nothing:
 * emails go out only when the organizer presses Send. Before Send, re-matching is free.
 * After Send, re-matching needs `confirmedAfterSend` and everyone must be sent a new email.
 *
 * `actorUserId` must come from the verified session, never from the request body.
 */
export async function runGroupDraw(
  groupId: string,
  actorUserId: string,
  { confirmedAfterSend = false }: { confirmedAfterSend?: boolean } = {},
): Promise<DrawOutcome> {
  const db = createAdminClient();

  const { data: actor } = await db
    .from("memberships")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", actorUserId)
    .in("role", ["organizer", "co_organizer"])
    .maybeSingle();
  if (!actor) return { ok: false, message: "Only the organizer can run the draw." };

  const { data: group, error: groupError } = await db.from("groups").select("status").eq("id", groupId).single();
  if (groupError) throw groupError;
  if (group.status === "sent" && !confirmedAfterSend) {
    return { ok: false, message: "Matches were already sent. Confirm to re-match; everyone will need a new email." };
  }
  const mode = group.status === "draft" ? "draw" : "redraw";

  const [{ data: members, error: membersError }, { data: rules, error: rulesError }] = await Promise.all([
    db.from("memberships").select("id, display_name").eq("group_id", groupId),
    db.from("exclusion_rules").select("a_id, b_id, two_way").eq("group_id", groupId),
  ]);
  if (membersError) throw membersError;
  if (rulesError) throw rulesError;

  const participants = members.map((m) => m.id as string);
  const exclusions = rulesToExclusions(
    rules.map((r) => ({ a: r.a_id as string, b: r.b_id as string, twoWay: r.two_way as boolean })),
  );

  const result = draw({ participants, exclusions });
  if (!result.ok) {
    const names = new Map(members.map((m) => [m.id as string, m.display_name as string]));
    return { ok: false, message: explainProblem(result.problem, (id) => names.get(id) ?? "someone") };
  }

  // Second line of defense: never save anything that breaks a rule.
  const errors = validateAssignments(participants, exclusions, result.assignments);
  if (errors.length) throw new Error(`Draw produced invalid matches: ${JSON.stringify(errors.map((e) => e.kind))}`);

  const { data: saved, error: saveError } = await db.rpc("save_assignments", {
    gid: groupId,
    pairs: result.assignments,
    action: mode,
    actor: actorUserId,
  });
  if (saveError) throw saveError;

  return { ok: true, matched: saved as number, singleLoop: result.singleLoop };
}

export function explainProblem(problem: DrawProblem, name: (id: string) => string): string {
  const list = (ids: string[]) => ids.map(name).join(", ");
  switch (problem.kind) {
    case "too_few_participants":
      return "Add at least 2 people before running the draw.";
    case "duplicate_participant":
      return `${name(problem.participant)} is on the list twice.`;
    case "unknown_participant_in_rule":
      return "A rule mentions someone who is no longer in the group. Remove that rule and try again.";
    case "rules_too_strict":
      return problem.canOnlyDraw.length === 0
        ? `The rules leave ${list(problem.givers)} with nobody to draw. Remove one of their rules.`
        : `The rules leave ${list(problem.givers)} able to draw only ${list(problem.canOnlyDraw)}, ` +
            `so someone would be left out. Remove one of their rules.`;
  }
}
