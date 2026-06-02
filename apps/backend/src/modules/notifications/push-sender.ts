/**
 * Push delivery abstraction. The service builds messages and targeting; the
 * sender owns the transport. Swappable like the SSV verifier so tests/dev run
 * without FCM creds (CLAUDE.md §7 — secrets out of code).
 */
export interface PushMessage {
  token: string;
  title: string;
  body: string;
}

export interface PushSendResult {
  sent: number;
  failed: number;
  /** Tokens FCM rejected as unregistered/invalid — caller disables them. */
  invalidTokens: string[];
}

export interface PushSender {
  send(messages: PushMessage[]): Promise<PushSendResult>;
}

/** Dev/test sender — pretends every message was delivered. Never touches FCM. */
export class NoopPushSender implements PushSender {
  async send(messages: PushMessage[]): Promise<PushSendResult> {
    return { sent: messages.length, failed: 0, invalidTokens: [] };
  }
}

/**
 * Real FCM sender (HTTP v1). Requires a service account — kept out of code
 * (§7/§13). Wiring the OAuth2 + batch send is a follow-up; until configured it
 * fails loudly rather than silently dropping a campaign.
 */
export class FcmPushSender implements PushSender {
  constructor(private readonly projectId?: string) {}

  async send(_messages: PushMessage[]): Promise<PushSendResult> {
    // ASSUMPTION: real FCM HTTP v1 send (service-account JWT → OAuth2 → /messages:send,
    // batched) lands with the native push stage. Guard against shipping a broken
    // "enabled" sender with no credentials.
    throw new Error(
      `FcmPushSender is not configured (project=${this.projectId ?? 'unset'}); set FCM_SERVICE_ACCOUNT`,
    );
  }
}
