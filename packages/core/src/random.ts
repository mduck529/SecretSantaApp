/**
 * Returns a uniformly distributed integer in [0, maxExclusive).
 * Injected so tests can be deterministic; production uses the secure default.
 */
export type RandomInt = (maxExclusive: number) => number;

/** Cryptographically secure, unbiased random integer (rejection sampling). */
export const secureRandomInt: RandomInt = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0 || maxExclusive > 2 ** 32) {
    throw new RangeError(`maxExclusive must be an integer in (0, 2^32], got ${maxExclusive}`);
  }
  const range = 2 ** 32;
  const limit = range - (range % maxExclusive);
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const value = buf[0]!;
    if (value < limit) return value % maxExclusive;
  }
};

/** Deterministic PRNG (mulberry32) for tests and reproducible simulations. Not for real draws. */
export function seededRandomInt(seed: number): RandomInt {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return Math.floor(r * maxExclusive);
  };
}

/** Fisher–Yates shuffle, returns a new array. */
export function shuffle<T>(items: readonly T[], randomInt: RandomInt): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
