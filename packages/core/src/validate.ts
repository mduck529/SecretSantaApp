import { makeIsAllowed, type Assignment, type Exclusion, type ParticipantId } from "./rules.js";

export type AssignmentError =
  | { kind: "missing_giver"; participant: ParticipantId }
  | { kind: "gives_more_than_once"; participant: ParticipantId }
  | { kind: "not_received"; participant: ParticipantId }
  | { kind: "receives_more_than_once"; participant: ParticipantId }
  | { kind: "unknown_participant"; participant: ParticipantId }
  | { kind: "self_draw"; participant: ParticipantId }
  | { kind: "breaks_rule"; giver: ParticipantId; receiver: ParticipantId };

/**
 * Independent check that a set of matches is complete and obeys every rule.
 * Run it on every draw/repair result before saving, as a second line of defense.
 */
export function validateAssignments(
  participants: readonly ParticipantId[],
  exclusions: readonly Exclusion[],
  assignments: readonly Assignment[],
): AssignmentError[] {
  const errors: AssignmentError[] = [];
  const known = new Set(participants);
  const isAllowed = makeIsAllowed(exclusions);
  const gives = new Map<ParticipantId, number>();
  const receives = new Map<ParticipantId, number>();

  for (const { giver, receiver } of assignments) {
    for (const p of [giver, receiver]) {
      if (!known.has(p)) errors.push({ kind: "unknown_participant", participant: p });
    }
    gives.set(giver, (gives.get(giver) ?? 0) + 1);
    receives.set(receiver, (receives.get(receiver) ?? 0) + 1);
    if (giver === receiver) errors.push({ kind: "self_draw", participant: giver });
    else if (!isAllowed(giver, receiver)) errors.push({ kind: "breaks_rule", giver, receiver });
  }

  for (const p of participants) {
    const g = gives.get(p) ?? 0;
    const r = receives.get(p) ?? 0;
    if (g === 0) errors.push({ kind: "missing_giver", participant: p });
    if (g > 1) errors.push({ kind: "gives_more_than_once", participant: p });
    if (r === 0) errors.push({ kind: "not_received", participant: p });
    if (r > 1) errors.push({ kind: "receives_more_than_once", participant: p });
  }
  return errors;
}
