/**
 * @vpn/shared — framework-agnostic helpers shared across apps (validation,
 * formatting, small utilities). Stage 1 ships only generic primitives;
 * business helpers (minute formatting, ledger math, ...) arrive with their stages.
 */

/** Promise-based delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Type guard removing `null` / `undefined` (useful in `.filter(isDefined)`). */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Exhaustiveness helper for `switch` / discriminated unions. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
