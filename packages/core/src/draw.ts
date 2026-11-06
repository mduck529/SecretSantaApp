import { secureRandomInt, shuffle, type RandomInt } from "./random.js";
import { makeIsAllowed, type Assignment, type Exclusion, type ParticipantId } from "./rules.js";

export interface DrawInput {
  participants: readonly ParticipantId[];
  exclusions: readonly Exclusion[];
  /** Defaults to a cryptographically secure source. Only override in tests. */
  randomInt?: RandomInt;
}

export type DrawProblem =
  | { kind: "too_few_participants"; count: number }
  | { kind: "duplicate_participant"; participant: ParticipantId }
  | { kind: "unknown_participant_in_rule"; participant: ParticipantId }
  /**
   * The rules leave these givers with only these (fewer) people to draw between them,
   * so someone would be left without a match. Loosen a rule involving one of them.
   */
  | { kind: "rules_too_strict"; givers: ParticipantId[]; canOnlyDraw: ParticipantId[] };

export type DrawResult =
  | {
      ok: true;
      assignments: Assignment[];
      /** True when the result is one big loop (nobody is in a closed swap like A↔B). */
      singleLoop: boolean;
    }
  | { ok: false; problem: DrawProblem };

/** Attempts of uniform rejection sampling before switching to search. */
const SAMPLING_ATTEMPTS = 2_000;
/** Step budget for the randomized single-loop search. */
const LOOP_SEARCH_STEPS = 200_000;

/**
 * Draws Secret Santa matches.
 *
 * Strategy:
 * 1. Prefer one single loop through everyone. First by sampling random loops
 *    (uniform over valid loops when the rules are light, as in most families),
 *    then by a budgeted randomized search when the rules are heavier.
 * 2. If no single loop can be found, fall back to any valid assignment
 *    (randomized maximum matching).
 * 3. If no valid assignment exists at all, explain which people the rules box in.
 */
export function draw(input: DrawInput): DrawResult {
  const randomInt = input.randomInt ?? secureRandomInt;
  const people = [...input.participants];

  const seen = new Set<ParticipantId>();
  for (const p of people) {
    if (seen.has(p)) return { ok: false, problem: { kind: "duplicate_participant", participant: p } };
    seen.add(p);
  }
  for (const e of input.exclusions) {
    for (const p of [e.giver, e.receiver]) {
      if (!seen.has(p)) return { ok: false, problem: { kind: "unknown_participant_in_rule", participant: p } };
    }
  }
  if (people.length < 2) return { ok: false, problem: { kind: "too_few_participants", count: people.length } };

  const isAllowed = makeIsAllowed(input.exclusions);

  const loop = sampleLoop(people, isAllowed, randomInt) ?? searchLoop(people, isAllowed, randomInt);
  if (loop) return { ok: true, assignments: loopToAssignments(loop), singleLoop: true };

  const matching = randomMatching(people, isAllowed, randomInt);
  if (matching.ok) {
    return { ok: true, assignments: matching.assignments, singleLoop: countLoops(matching.assignments) === 1 };
  }
  return { ok: false, problem: matching.problem };
}

type IsAllowed = (giver: ParticipantId, receiver: ParticipantId) => boolean;

function loopToAssignments(order: readonly ParticipantId[]): Assignment[] {
  return order.map((giver, i) => ({ giver, receiver: order[(i + 1) % order.length]! }));
}

function isValidLoop(order: readonly ParticipantId[], isAllowed: IsAllowed) {
  return order.every((giver, i) => isAllowed(giver, order[(i + 1) % order.length]!));
}

function sampleLoop(people: ParticipantId[], isAllowed: IsAllowed, randomInt: RandomInt) {
  for (let i = 0; i < SAMPLING_ATTEMPTS; i++) {
    const order = shuffle(people, randomInt);
    if (isValidLoop(order, isAllowed)) return order;
  }
  return null;
}

/** Randomized depth-first search for a single loop, with a step budget. */
function searchLoop(people: ParticipantId[], isAllowed: IsAllowed, randomInt: RandomInt) {
  const order = shuffle(people, randomInt);
  const start = order[0]!;
  const path: ParticipantId[] = [start];
  const used = new Set<ParticipantId>([start]);
  let steps = 0;

  const extend = (): boolean => {
    if (++steps > LOOP_SEARCH_STEPS) return false;
    const current = path[path.length - 1]!;
    if (path.length === people.length) return isAllowed(current, start);
    for (const next of shuffle(order, randomInt)) {
      if (used.has(next) || !isAllowed(current, next)) continue;
      path.push(next);
      used.add(next);
      if (extend()) return true;
      path.pop();
      used.delete(next);
      if (steps > LOOP_SEARCH_STEPS) return false;
    }
    return false;
  };

  return extend() ? path : null;
}

/**
 * Maximum bipartite matching (givers → receivers) over shuffled inputs.
 * When it is not perfect, extracts a Hall's-theorem witness: a set of givers
 * whose allowed receivers number fewer than the givers.
 */
function randomMatching(
  people: ParticipantId[],
  isAllowed: IsAllowed,
  randomInt: RandomInt,
): { ok: true; assignments: Assignment[] } | { ok: false; problem: DrawProblem } {
  const givers = shuffle(people, randomInt);
  const options = new Map<ParticipantId, ParticipantId[]>(
    givers.map((g) => [g, shuffle(people.filter((r) => isAllowed(g, r)), randomInt)]),
  );
  const giverOf = new Map<ParticipantId, ParticipantId>(); // receiver -> giver

  const tryAssign = (giver: ParticipantId, visited: Set<ParticipantId>): boolean => {
    for (const r of options.get(giver)!) {
      if (visited.has(r)) continue;
      visited.add(r);
      const holder = giverOf.get(r);
      if (holder === undefined || tryAssign(holder, visited)) {
        giverOf.set(r, giver);
        return true;
      }
    }
    return false;
  };

  for (const g of givers) {
    if (!tryAssign(g, new Set())) {
      // Alternating search from the unmatched giver: every receiver reached is
      // matched (else we'd have an augmenting path), so |receivers| = |givers| - 1.
      const zGivers = new Set<ParticipantId>([g]);
      const zReceivers = new Set<ParticipantId>();
      const queue = [g];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const r of options.get(cur)!) {
          if (zReceivers.has(r)) continue;
          zReceivers.add(r);
          const holder = giverOf.get(r);
          if (holder !== undefined && !zGivers.has(holder)) {
            zGivers.add(holder);
            queue.push(holder);
          }
        }
      }
      const order = new Map(people.map((p, i) => [p, i]));
      const sorted = (s: Set<ParticipantId>) => [...s].sort((a, b) => order.get(a)! - order.get(b)!);
      return { ok: false, problem: { kind: "rules_too_strict", givers: sorted(zGivers), canOnlyDraw: sorted(zReceivers) } };
    }
  }

  const assignments = people.map((p) => ({ giver: p, receiver: "" }));
  const index = new Map(people.map((p, i) => [p, i]));
  for (const [receiver, giver] of giverOf) assignments[index.get(giver)!]!.receiver = receiver;
  return { ok: true, assignments };
}

/** Number of separate loops in a complete assignment. */
export function countLoops(assignments: readonly Assignment[]): number {
  const next = new Map(assignments.map((a) => [a.giver, a.receiver]));
  const visited = new Set<ParticipantId>();
  let loops = 0;
  for (const start of next.keys()) {
    if (visited.has(start)) continue;
    loops++;
    let cur: ParticipantId | undefined = start;
    while (cur !== undefined && !visited.has(cur)) {
      visited.add(cur);
      cur = next.get(cur);
    }
  }
  return loops;
}
