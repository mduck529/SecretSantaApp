import { secureRandomInt, shuffle, type RandomInt } from "./random.js";
import { makeIsAllowed, type Assignment, type Exclusion, type ParticipantId } from "./rules.js";

/**
 * Result of changing the group after the draw. `changedGivers` are the only people
 * whose match changed; only they should be emailed. Callers must not show the
 * organizer who they are (just how many).
 */
export type RepairResult =
  | { ok: true; assignments: Assignment[]; changedGivers: ParticipantId[] }
  | { ok: false; reason: "not_in_draw" | "already_in_draw" | "needs_redraw" };

interface RepairOptions {
  exclusions: readonly Exclusion[];
  randomInt?: RandomInt;
}

/**
 * Removes someone after the draw while changing as few matches as possible.
 *
 * Usually one change: the dropout's Santa takes over the dropout's giftee.
 * If that pairing isn't allowed (a rule, or the two were swapping with each other),
 * swaps with one other pair, changing two matches. Otherwise asks for a re-draw.
 */
export function removeParticipant(
  current: readonly Assignment[],
  removed: ParticipantId,
  { exclusions, randomInt = secureRandomInt }: RepairOptions,
): RepairResult {
  const isAllowed = makeIsAllowed(exclusions);
  const santa = current.find((a) => a.receiver === removed)?.giver;
  const giftee = current.find((a) => a.giver === removed)?.receiver;
  if (santa === undefined || giftee === undefined) return { ok: false, reason: "not_in_draw" };

  const rest = current.filter((a) => a.giver !== removed && a.giver !== santa);
  if (rest.length + 1 < 2) return { ok: false, reason: "needs_redraw" };

  if (isAllowed(santa, giftee)) {
    return { ok: true, assignments: [...rest, { giver: santa, receiver: giftee }], changedGivers: [santa] };
  }

  // Swap with one other pair X→Y: santa→Y and X→giftee.
  for (const pair of shuffle(rest, randomInt)) {
    if (isAllowed(santa, pair.receiver) && isAllowed(pair.giver, giftee)) {
      const assignments = rest
        .filter((a) => a.giver !== pair.giver)
        .concat({ giver: santa, receiver: pair.receiver }, { giver: pair.giver, receiver: giftee });
      return { ok: true, assignments, changedGivers: [santa, pair.giver] };
    }
  }
  return { ok: false, reason: "needs_redraw" };
}

/**
 * Adds someone after the draw by splicing them into one existing pair:
 * X→Y becomes X→newcomer→Y. Only X's match changes (plus the newcomer's new one).
 */
export function addParticipant(
  current: readonly Assignment[],
  added: ParticipantId,
  { exclusions, randomInt = secureRandomInt }: RepairOptions,
): RepairResult {
  if (current.some((a) => a.giver === added || a.receiver === added)) {
    return { ok: false, reason: "already_in_draw" };
  }
  const isAllowed = makeIsAllowed(exclusions);
  for (const pair of shuffle(current, randomInt)) {
    if (isAllowed(pair.giver, added) && isAllowed(added, pair.receiver)) {
      const assignments = current
        .filter((a) => a.giver !== pair.giver)
        .concat({ giver: pair.giver, receiver: added }, { giver: added, receiver: pair.receiver });
      return { ok: true, assignments, changedGivers: [pair.giver, added] };
    }
  }
  return { ok: false, reason: "needs_redraw" };
}
