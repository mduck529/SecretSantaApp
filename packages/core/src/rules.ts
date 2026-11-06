export type ParticipantId = string;

/** A directed rule: `giver` may not draw `receiver`. */
export interface Exclusion {
  giver: ParticipantId;
  receiver: ParticipantId;
}

/** A rule as the organizer enters it on the roster ("Alex can't draw Sam"). */
export interface Rule {
  a: ParticipantId;
  b: ParticipantId;
  /** Two-way (the default, e.g. couples) or only "a can't draw b". */
  twoWay: boolean;
}

export function rulesToExclusions(rules: readonly Rule[]): Exclusion[] {
  const out: Exclusion[] = [];
  for (const r of rules) {
    out.push({ giver: r.a, receiver: r.b });
    if (r.twoWay) out.push({ giver: r.b, receiver: r.a });
  }
  return out;
}

export interface Assignment {
  giver: ParticipantId;
  receiver: ParticipantId;
}

/** Builds a fast "may giver draw receiver?" check. Self-draws are never allowed. */
export function makeIsAllowed(exclusions: readonly Exclusion[]) {
  const blocked = new Set(exclusions.map((e) => key(e.giver, e.receiver)));
  return (giver: ParticipantId, receiver: ParticipantId) =>
    giver !== receiver && !blocked.has(key(giver, receiver));
}

function key(giver: string, receiver: string) {
  return JSON.stringify([giver, receiver]);
}
