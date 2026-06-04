import type { ProxyConfig } from './proxy-parser.js';
import { buildOutbound, type SingBoxOutbound } from './singbox-outbound.js';

/**
 * Assembles the full sing-box config that the native module runs.
 *
 * Targets the sing-box 1.11+ schema (valid through current stable 1.13.x). It
 * deliberately avoids every field removed by 1.11/1.12 so a modern core does
 * not reject it:
 *   - tun uses `address` (array), NOT inet4_address/inet6_address (removed 1.12)
 *   - sniff / hijack-dns live in route rule ACTIONS, NOT on the tun inbound
 *     (moved in 1.11); no inbound `sniff` / `domain_strategy`
 *   - no {type:"block"} / {type:"dns"} outbounds (removed 1.11) → rule actions
 *   - no top-level route.geoip / route.geosite (removed)
 *
 * On Android, libbox builds the tun FROM this inbound (TunOptions → openTun
 * callback → VpnService.establish() → fd). So the config MUST carry a tun
 * inbound, and must NOT contain a numeric fd.
 *
 * The output is the per-server `configBlob` — NEVER surfaced to the user (§7.2).
 */

export type SingBoxStack = 'system' | 'gvisor' | 'mixed';

export interface SingBoxTunInbound {
  type: 'tun';
  tag: string;
  address: string[];
  mtu: number;
  auto_route: true;
  strict_route: boolean;
  stack: SingBoxStack;
  platform: { http_proxy: { enabled: false } };
}

export interface SingBoxDirectOutbound {
  type: 'direct';
  tag: 'direct';
}

export interface SingBoxRouteRule {
  action?: string;
  outbound?: string;
  timeout?: string;
  protocol?: string;
  ip_is_private?: boolean;
}

export interface SingBoxConfig {
  log: { level: string; timestamp: boolean };
  inbounds: [SingBoxTunInbound];
  outbounds: [SingBoxOutbound, SingBoxDirectOutbound];
  route: {
    rules: SingBoxRouteRule[];
    final: 'proxy';
    auto_detect_interface: true;
  };
}

export interface BuildConfigOptions {
  /** Userspace stack. gvisor "just works" over the VpnService fd (default). */
  stack?: SingBoxStack;
  /** tun MTU. Native side should prefer the value libbox picks via TunOptions. */
  mtu?: number;
  logLevel?: string;
}

// Private CGNAT/ULA ranges for the tun interface itself (not user traffic).
const TUN_ADDRESS = ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'];

/** Builds the full sing-box config for one proxy server. */
export function buildSingBoxConfig(proxy: ProxyConfig, opts: BuildConfigOptions = {}): SingBoxConfig {
  const outbound = buildOutbound(proxy, 'proxy');
  return {
    log: { level: opts.logLevel ?? 'warn', timestamp: true },
    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        address: TUN_ADDRESS,
        mtu: opts.mtu ?? 1500,
        auto_route: true,
        strict_route: true,
        stack: opts.stack ?? 'gvisor',
        platform: { http_proxy: { enabled: false } },
      },
    ],
    outbounds: [outbound, { type: 'direct', tag: 'direct' }],
    route: {
      rules: [
        { action: 'sniff', timeout: '300ms' },
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_is_private: true, action: 'route', outbound: 'direct' },
      ],
      final: 'proxy',
      auto_detect_interface: true,
    },
  };
}

/** Builds the config and serializes it to the JSON string stored as configBlob. */
export function buildSingBoxConfigJson(proxy: ProxyConfig, opts: BuildConfigOptions = {}): string {
  return JSON.stringify(buildSingBoxConfig(proxy, opts), null, 2);
}
