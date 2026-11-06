import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  addParticipant,
  countLoops,
  draw,
  makeIsAllowed,
  removeParticipant,
  rulesToExclusions,
  secureRandomInt,
  seededRandomInt,
  validateAssignments,
  type Assignment,
  type Exclusion,
} from "./index.js";

const names = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);

/** Random group with random one-way exclusions; density controls how strict the rules are. */
const groupArb = (maxSize: number) =>
  fc
    .record({
      size: fc.integer({ min: 2, max: maxSize }),
      density: fc.double({ min: 0, max: 0.9, noNaN: true }),
      seed: fc.integer(),
    })
    .map(({ size, density, seed }) => {
      const rand = seededRandomInt(seed);
      const people = names(size);
      const exclusions: Exclusion[] = [];
      for (const g of people)
        for (const r of people) if (g !== r && rand(1000) / 1000 < density) exclusions.push({ giver: g, receiver: r });
      return { people, exclusions, seed };
    });

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((x, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Exhaustive ground truth for small groups. */
function bruteForce(people: string[], exclusions: Exclusion[]) {
  const ok = makeIsAllowed(exclusions);
  let anyValid = false;
  let anyLoop = false;
  for (const perm of permutations(people)) {
    const a = people.map((g, i) => ({ giver: g, receiver: perm[i]! }));
    if (a.every((x) => ok(x.giver, x.receiver))) {
      anyValid = true;
      if (countLoops(a) === 1) anyLoop = true;
    }
  }
  return { anyValid, anyLoop };
}

describe("draw", () => {
  it("gives a typical family (6 couples) one loop with no partners matched", () => {
    const people = names(12);
    const couples = rulesToExclusions(
      [0, 2, 4, 6, 8, 10].map((i) => ({ a: `p${i}`, b: `p${i + 1}`, twoWay: true })),
    );
    for (let i = 0; i < 200; i++) {
      const result = draw({ participants: people, exclusions: couples });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(validateAssignments(people, couples, result.assignments)).toEqual([]);
      expect(result.singleLoop).toBe(true);
      expect(countLoops(result.assignments)).toBe(1);
    }
  });

  it("always returns valid matches or an accurate explanation (property)", () => {
    fc.assert(
      fc.property(groupArb(30), ({ people, exclusions, seed }) => {
        const result = draw({ participants: people, exclusions, randomInt: seededRandomInt(seed) });
        if (result.ok) {
          expect(validateAssignments(people, exclusions, result.assignments)).toEqual([]);
          expect(result.singleLoop).toBe(countLoops(result.assignments) === 1);
        } else {
          expect(result.problem.kind).toBe("rules_too_strict");
          if (result.problem.kind !== "rules_too_strict") return;
          // Hall witness: these givers can only draw from a smaller set of people.
          const { givers, canOnlyDraw } = result.problem;
          expect(canOnlyDraw.length).toBeLessThan(givers.length);
          const ok = makeIsAllowed(exclusions);
          for (const g of givers) for (const r of people) if (ok(g, r)) expect(canOnlyDraw).toContain(r);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("matches exhaustive search on small groups: finds a draw (and a single loop) exactly when one exists", () => {
    fc.assert(
      fc.property(groupArb(7), ({ people, exclusions, seed }) => {
        const truth = bruteForce(people, exclusions);
        const result = draw({ participants: people, exclusions, randomInt: seededRandomInt(seed) });
        expect(result.ok).toBe(truth.anyValid);
        if (result.ok) expect(result.singleLoop).toBe(truth.anyLoop);
      }),
      { numRuns: 400 },
    );
  });

  it("spreads results evenly across possible loops", () => {
    // 4 people, no rules: 3! = 6 distinct loops, each should appear ~1/6 of the time.
    const people = names(4);
    const counts = new Map<string, number>();
    const runs = 6000;
    const rand = seededRandomInt(42);
    for (let i = 0; i < runs; i++) {
      const result = draw({ participants: people, exclusions: [], randomInt: rand });
      if (!result.ok) throw new Error("unexpected");
      const next = new Map(result.assignments.map((a) => [a.giver, a.receiver]));
      let cur = "p0";
      let sig = "";
      for (let k = 0; k < 4; k++) {
        sig += cur;
        cur = next.get(cur)!;
      }
      counts.set(sig, (counts.get(sig) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const c of counts.values()) expect(Math.abs(c - runs / 6)).toBeLessThan(runs / 6 * 0.15);
  });

  it("falls back to separate loops when one loop is impossible", () => {
    // p0 and p1 may only draw each other; p2 and p3 may only draw each other.
    const people = names(4);
    const exclusions = rulesToExclusions([
      { a: "p0", b: "p2", twoWay: true },
      { a: "p0", b: "p3", twoWay: true },
      { a: "p1", b: "p2", twoWay: true },
      { a: "p1", b: "p3", twoWay: true },
    ]);
    const result = draw({ participants: people, exclusions });
    expect(result.ok && result.singleLoop).toBe(false);
    if (result.ok) expect(validateAssignments(people, exclusions, result.assignments)).toEqual([]);
  });

  it("explains which people the rules box in", () => {
    // 3 people; p1 and p2 both can't draw anyone but p0.
    const people = names(3);
    const exclusions: Exclusion[] = [
      { giver: "p1", receiver: "p2" },
      { giver: "p2", receiver: "p1" },
    ];
    const result = draw({ participants: people, exclusions });
    expect(result).toEqual({
      ok: false,
      problem: { kind: "rules_too_strict", givers: ["p1", "p2"], canOnlyDraw: ["p0"] },
    });
  });

  it("rejects bad input", () => {
    expect(draw({ participants: ["a"], exclusions: [] })).toMatchObject({ ok: false, problem: { kind: "too_few_participants" } });
    expect(draw({ participants: ["a", "a"], exclusions: [] })).toMatchObject({ ok: false, problem: { kind: "duplicate_participant" } });
    expect(draw({ participants: ["a", "b"], exclusions: [{ giver: "a", receiver: "z" }] })).toMatchObject({
      ok: false,
      problem: { kind: "unknown_participant_in_rule", participant: "z" },
    });
  });

  it("is fast for a large group with many rules", () => {
    const people = names(300);
    const rand = seededRandomInt(7);
    const exclusions: Exclusion[] = [];
    for (const g of people) for (let k = 0; k < 30; k++) exclusions.push({ giver: g, receiver: people[rand(300)]! });
    const t = performance.now();
    const result = draw({ participants: people, exclusions });
    expect(performance.now() - t).toBeLessThan(5000);
    expect(result.ok).toBe(true);
  });
});

describe("secureRandomInt", () => {
  it("stays in range", () => {
    for (let i = 0; i < 1000; i++) {
      const v = secureRandomInt(7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });
});

describe("changes after the draw", () => {
  const drawn = (people: string[], exclusions: Exclusion[], seed: number) => {
    const r = draw({ participants: people, exclusions, randomInt: seededRandomInt(seed) });
    return r.ok ? r.assignments : null;
  };
  const changed = (before: readonly Assignment[], after: readonly Assignment[]) => {
    const prev = new Map(before.map((a) => [a.giver, a.receiver]));
    return after.filter((a) => prev.get(a.giver) !== a.receiver).map((a) => a.giver).sort();
  };

  it("removing someone changes at most two matches and reports exactly who changed (property)", () => {
    fc.assert(
      fc.property(groupArb(20), fc.nat(), ({ people, exclusions, seed }, pick) => {
        const before = drawn(people, exclusions, seed);
        if (!before || people.length < 3) return;
        const removed = people[pick % people.length]!;
        const remaining = people.filter((p) => p !== removed);
        const remainingRules = exclusions.filter((e) => e.giver !== removed && e.receiver !== removed);
        const result = removeParticipant(before, removed, { exclusions, randomInt: seededRandomInt(seed) });
        if (!result.ok) {
          expect(result.reason).toBe("needs_redraw");
          return;
        }
        expect(validateAssignments(remaining, remainingRules, result.assignments)).toEqual([]);
        expect(result.changedGivers.length).toBeLessThanOrEqual(2);
        expect([...result.changedGivers].sort()).toEqual(changed(before, result.assignments));
      }),
      { numRuns: 400 },
    );
  });

  it("removing someone from a family usually changes just one match", () => {
    const people = names(12);
    const couples = rulesToExclusions([0, 2, 4, 6, 8, 10].map((i) => ({ a: `p${i}`, b: `p${i + 1}`, twoWay: true })));
    const before = drawn(people, couples, 1)!;
    const result = removeParticipant(before, "p5", { exclusions: couples });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.changedGivers.length).toBeLessThanOrEqual(2);
  });

  it("adding someone changes one existing match plus the newcomer's (property)", () => {
    fc.assert(
      fc.property(groupArb(20), ({ people, exclusions, seed }) => {
        const before = drawn(people, exclusions, seed);
        if (!before) return;
        const newcomer = "new";
        const result = addParticipant(before, newcomer, { exclusions, randomInt: seededRandomInt(seed) });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(validateAssignments([...people, newcomer], exclusions, result.assignments)).toEqual([]);
        expect([...result.changedGivers].sort()).toEqual(changed(before, result.assignments));
        expect(result.changedGivers.length).toBe(2);
      }),
      { numRuns: 300 },
    );
  });

  it("refuses to add someone already in the draw", () => {
    const before = drawn(names(3), [], 1)!;
    expect(addParticipant(before, "p0", { exclusions: [] })).toEqual({ ok: false, reason: "already_in_draw" });
  });
});
