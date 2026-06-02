/**
 * App-side VPN contract. Mirrors the native module's API (modules/vpn) so screens
 * and hooks can be written against a stable type before the native module is
 * linked into a dev/preview build. Wiring the live module is a 5-line step done
 * after the first native build — see docs/VPN.md.
 *
 * Privacy (CLAUDE.md §7.2): the UI only ever works with the safe `VpnServerView`
 * (country/flag/name/ping); the raw sing-box config stays inside the native layer
 * and is never imported here.
 */
export type VpnConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export interface VpnStatus {
  state: VpnConnectionState;
  bytesIn: number;
  bytesOut: number;
  connectedAtMs: number | null;
}

export const DISCONNECTED_STATUS: VpnStatus = {
  state: 'disconnected',
  bytesIn: 0,
  bytesOut: 0,
  connectedAtMs: null,
};

export interface VpnController {
  prepare(): Promise<boolean>;
  start(input: { config: string; sessionToken: string; serverName: string }): Promise<void>;
  stop(): Promise<void>;
  getStatus(): Promise<VpnStatus>;
}
