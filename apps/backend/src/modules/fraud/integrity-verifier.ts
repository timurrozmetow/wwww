/**
 * Play Integrity token verification (CLAUDE.md §9). Swappable like the SSV
 * verifier so dev/test run without Google credentials. The raw token is NEVER
 * persisted — only the boolean verdict feeds the fraud score (§9 privacy).
 */
export interface IntegrityVerdict {
  valid: boolean;
  reason: string;
}

export interface IntegrityVerifier {
  verifyToken(token: string): Promise<IntegrityVerdict>;
}

/** Disabled mode — does not call Google; treats integrity as unevaluated (trusted). */
export class NoopIntegrityVerifier implements IntegrityVerifier {
  async verifyToken(_token: string): Promise<IntegrityVerdict> {
    return { valid: true, reason: 'unevaluated' };
  }
}

/**
 * Real Play Integrity verifier (Google Play Integrity API). Requires a project
 * number + service-account credentials, kept out of code (§7/§13). Wiring the
 * decode + verdict checks is a follow-up; until configured it fails loudly so an
 * "enabled" verifier never silently passes everything.
 */
export class PlayIntegrityVerifier implements IntegrityVerifier {
  constructor(private readonly projectNumber?: string) {}

  async verifyToken(_token: string): Promise<IntegrityVerdict> {
    // ASSUMPTION: real decode of the Play Integrity verdict (deviceRecognitionVerdict,
    // appRecognitionVerdict, accountDetails) lands with the native anti-fraud stage.
    throw new Error(
      `PlayIntegrityVerifier is not configured (project=${this.projectNumber ?? 'unset'})`,
    );
  }
}
