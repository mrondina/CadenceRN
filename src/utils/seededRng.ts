/**
 * Deterministic seeded RNG utilities — no Math.random anywhere.
 *
 * FNV-1a (32-bit): maps a string to an unsigned 32-bit integer seed.
 * mulberry32: fast, high-quality seeded PRNG returning floats in [0, 1).
 * shuffleWithSeed: Fisher-Yates over a copy of the input array.
 *
 * Same seed always produces the same output — suitable for per-item stable
 * orderings (MCQ choices) and per-study-day stable queue shuffles.
 */

/** FNV-1a 32-bit string hash → unsigned 32-bit integer. */
export function fnv1a32(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // Math.imul gives the correct 32-bit multiplication without BigInt
    hash = Math.imul(hash, 16777619); // FNV prime
  }
  return hash >>> 0; // coerce to unsigned 32-bit
}

/** Returns a seeded PRNG that yields floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/** Returns a new array with elements in a deterministically shuffled order. */
export function shuffleWithSeed<T>(arr: readonly T[], seed: number): T[] {
  const result = [...arr];
  const rng = mulberry32(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
