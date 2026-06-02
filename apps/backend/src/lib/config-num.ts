export interface IntBounds {
  min?: number;
  max?: number;
}

/**
 * Strict, safe parser for security-/money-relevant `remote_config` integers
 * (CLAUDE.md §8). Accepts ONLY plain non-negative digit strings, so a
 * fat-fingered or compromised row cannot weaken a gate via:
 *   - scientific notation (`'1e9'` → fallback, not 1_000_000_000),
 *   - empty / whitespace (`''`, `'  '` → fallback, NOT 0 — which would silently
 *     disable a heuristic or threshold),
 *   - decimals / hex / junk (`'50.5'`, `'0x1f'`, `'true'` → fallback).
 * The result is clamped to [min, max] so an in-range-but-absurd value (e.g.
 * `fraud_score_max = 999999999`) can never turn a gate into a no-op.
 */
export function configInt(
  raw: string | undefined,
  fallback: number,
  bounds: IntBounds = {},
): number {
  if (raw === undefined) return fallback;
  const t = raw.trim();
  if (!/^\d+$/.test(t)) return fallback;
  const n = Number(t);
  if (!Number.isSafeInteger(n)) return fallback;
  const min = bounds.min ?? 0;
  const max = bounds.max ?? Number.MAX_SAFE_INTEGER;
  return Math.min(Math.max(n, min), max);
}
