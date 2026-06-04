import type { ProxyConfig } from './proxy-parser.js';

/**
 * Maps a normalized {@link ProxyConfig} to a sing-box outbound object.
 *
 * Targets the modern sing-box schema (1.11+/1.12), where the outbound shape for
 * vless/vmess/trojan/shadowsocks plus the `tls`/`transport` sub-objects is
 * stable. The tun inbound + route wrapper lives separately (singbox-config),
 * because whether a config carries a tun inbound at all depends on the Android
 * libbox integration model.
 */

export interface SingBoxTls {
  enabled: true;
  server_name?: string;
  insecure?: boolean;
  alpn?: string[];
  utls?: { enabled: true; fingerprint: string };
  reality?: { enabled: true; public_key: string; short_id?: string };
}

export interface SingBoxTransport {
  type: 'ws' | 'grpc' | 'http';
  path?: string;
  headers?: Record<string, string>;
  host?: string[];
  service_name?: string;
}

export interface SingBoxOutbound {
  type: ProxyConfig['protocol'];
  tag: string;
  server: string;
  server_port: number;
  uuid?: string;
  password?: string;
  method?: string;
  security?: string; // vmess cipher
  alter_id?: number;
  flow?: string;
  packet_encoding?: string;
  tls?: SingBoxTls;
  transport?: SingBoxTransport;
}

const DEFAULT_FINGERPRINT = 'chrome';

/** Builds the sing-box outbound for a single proxy. */
export function buildOutbound(config: ProxyConfig, tag = 'proxy'): SingBoxOutbound {
  const base: SingBoxOutbound = {
    type: config.protocol,
    tag,
    server: config.server,
    server_port: config.port,
  };

  const tls = buildTls(config);
  const transport = buildTransport(config);

  switch (config.protocol) {
    case 'vless':
      return prune({
        ...base,
        uuid: config.uuid,
        flow: config.flow || undefined,
        packet_encoding: 'xudp',
        tls,
        transport,
      });
    case 'vmess':
      return prune({
        ...base,
        uuid: config.uuid,
        security: 'auto',
        alter_id: config.alterId ?? 0,
        tls,
        transport,
      });
    case 'trojan':
      return prune({ ...base, password: config.password, tls, transport });
    case 'shadowsocks':
      return prune({ ...base, method: config.method, password: config.password });
  }
}

// buildTls/buildTransport return bare literals (typed by the return annotation);
// buildOutbound's outer prune() recursively strips the undefined keys.
function buildTls(config: ProxyConfig): SingBoxTls | undefined {
  if (config.security === 'none') return undefined;

  if (config.security === 'reality') {
    // sing-box requires utls alongside reality.
    return {
      enabled: true,
      server_name: config.sni,
      utls: { enabled: true, fingerprint: config.fingerprint || DEFAULT_FINGERPRINT },
      reality: {
        enabled: true,
        public_key: config.realityPublicKey ?? '',
        short_id: config.realityShortId,
      },
    };
  }

  // plain TLS
  return {
    enabled: true,
    server_name: config.sni,
    insecure: config.allowInsecure ? true : undefined,
    alpn: config.alpn,
    utls: config.fingerprint ? { enabled: true, fingerprint: config.fingerprint } : undefined,
  };
}

function buildTransport(config: ProxyConfig): SingBoxTransport | undefined {
  switch (config.network) {
    case 'ws':
      return {
        type: 'ws',
        path: config.wsPath || '/',
        headers: config.wsHost ? { Host: config.wsHost } : undefined,
      };
    case 'grpc':
      return { type: 'grpc', service_name: config.grpcServiceName || '' };
    case 'http':
      return {
        type: 'http',
        path: config.wsPath || '/',
        host: config.wsHost ? [config.wsHost] : undefined,
      };
    default:
      return undefined;
  }
}

/** Drops keys whose value is undefined (shallow), recursing into plain objects. */
function prune<T extends Record<string, unknown>>(obj: T): T {
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value === undefined) {
      delete obj[key];
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      prune(value as Record<string, unknown>);
    }
  }
  return obj;
}
