export type VpnConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface VpnStartConfig {
  /**
   * Opaque sing-box config JSON issued by the backend for this session. It is fed
   * straight to the native core and is NEVER surfaced in the UI (CLAUDE.md §7.2 —
   * the user only ever sees country/flag/name/ping).
   */
  config: string;
  /** Short-lived VPN session token (backend validates balance before issuing). */
  sessionToken: string;
  /** Display-only server label for the foreground-service notification. */
  serverName: string;
}

export interface VpnStatus {
  state: VpnConnectionState;
  bytesIn: number;
  bytesOut: number;
  /** Epoch ms when the tunnel connected, or null when not connected. */
  connectedAtMs: number | null;
}

export type VpnStatusEvent = VpnStatus;
