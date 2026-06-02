/**
 * Minimal error sink. Stage 8 forwards these to Sentry (@sentry/react-native —
 * native, needs a dev build); until then we at least never swallow failures.
 */
export function logError(message: string, error?: unknown): void {
  console.error(`[vpn] ${message}`, error);
}
