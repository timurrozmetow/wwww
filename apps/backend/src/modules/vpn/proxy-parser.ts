/**
 * Parses V2Ray/Xray/sing-box proxy share links (vless/vmess/trojan/ss) and
 * subscription payloads into a normalized {@link ProxyConfig}. Pure and
 * dependency-free so it is fully unit-testable. The output feeds the sing-box
 * config builder; none of it is ever surfaced to end users (§7.2).
 */

export type ProxyProtocol = 'vless' | 'vmess' | 'trojan' | 'shadowsocks';
export type ProxyNetwork = 'tcp' | 'ws' | 'grpc' | 'http';
export type ProxySecurity = 'none' | 'tls' | 'reality';

export interface ProxyConfig {
  protocol: ProxyProtocol;
  /** Human label from the URI fragment (falls back to host:port). */
  tag: string;
  server: string;
  port: number;

  // credentials
  uuid?: string; // vless / vmess
  password?: string; // trojan / shadowsocks
  method?: string; // shadowsocks cipher
  alterId?: number; // vmess aid

  // vless specifics
  flow?: string; // xtls-rprx-vision
  encryption?: string; // vless: usually 'none'

  // transport
  network: ProxyNetwork;
  wsPath?: string;
  wsHost?: string;
  grpcServiceName?: string;

  // tls / reality
  security: ProxySecurity;
  sni?: string;
  alpn?: string[];
  fingerprint?: string; // utls fingerprint (chrome, firefox, ...)
  allowInsecure?: boolean;
  realityPublicKey?: string;
  realityShortId?: string;
}

const SCHEMES = ['vless://', 'vmess://', 'trojan://', 'ss://'] as const;

/** Returns true if the line starts with a supported proxy scheme. */
export function isProxyUri(line: string): boolean {
  const v = line.trim();
  return SCHEMES.some((s) => v.startsWith(s));
}

/** Parses a single proxy URI, or returns null if it can't be understood. */
export function parseProxyUri(uri: string): ProxyConfig | null {
  const raw = uri.trim();
  try {
    if (raw.startsWith('vless://')) return parseVless(raw);
    if (raw.startsWith('vmess://')) return parseVmess(raw);
    if (raw.startsWith('trojan://')) return parseTrojan(raw);
    if (raw.startsWith('ss://')) return parseShadowsocks(raw);
  } catch {
    return null;
  }
  return null;
}

/**
 * Parses a subscription payload into a list of configs. Accepts either a
 * base64-encoded blob (the common case) or a plain newline-separated list of
 * URIs. Unparseable lines are dropped.
 */
export function parseSubscription(payload: string): ProxyConfig[] {
  const text = decodeSubscriptionBody(payload);
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && isProxyUri(l))
    .map(parseProxyUri)
    .filter((c): c is ProxyConfig => c !== null);
}

/** If the body is base64 (no scheme visible), decode it; otherwise return as-is. */
function decodeSubscriptionBody(payload: string): string {
  const t = payload.trim();
  if (t.includes('://')) return t;
  try {
    const decoded = Buffer.from(t.replace(/\s+/g, ''), 'base64').toString('utf8');
    if (decoded.includes('://')) return decoded;
  } catch {
    // not base64
  }
  return t;
}

// --- per-protocol parsers ----------------------------------------------------

function parseVless(uri: string): ProxyConfig {
  const url = new URL(uri);
  const q = url.searchParams;
  const security = normalizeSecurity(q.get('security'));
  const network = normalizeNetwork(q.get('type') ?? q.get('network'));

  return finalize({
    protocol: 'vless',
    tag: fragmentTag(url.hash, url.hostname, url.port),
    server: cleanHost(url.hostname),
    port: portOf(url.port),
    uuid: decodeURIComponent(url.username),
    encryption: q.get('encryption') ?? 'none',
    flow: q.get('flow') ?? undefined,
    network,
    ...transportParams(network, q),
    security,
    sni: q.get('sni') ?? q.get('peer') ?? undefined,
    alpn: parseAlpn(q.get('alpn')),
    fingerprint: q.get('fp') ?? undefined,
    allowInsecure: boolFlag(q.get('allowInsecure') ?? q.get('insecure')),
    realityPublicKey: security === 'reality' ? (q.get('pbk') ?? q.get('publicKey') ?? undefined) : undefined,
    realityShortId: security === 'reality' ? (q.get('sid') ?? q.get('shortId') ?? undefined) : undefined,
  });
}

function parseTrojan(uri: string): ProxyConfig {
  const url = new URL(uri);
  const q = url.searchParams;
  // trojan defaults to TLS; honour an explicit security=none/reality.
  const security = q.has('security') ? normalizeSecurity(q.get('security')) : 'tls';
  const network = normalizeNetwork(q.get('type') ?? q.get('network'));

  return finalize({
    protocol: 'trojan',
    tag: fragmentTag(url.hash, url.hostname, url.port),
    server: cleanHost(url.hostname),
    port: portOf(url.port),
    password: decodeURIComponent(url.username || url.password),
    network,
    ...transportParams(network, q),
    security,
    sni: q.get('sni') ?? q.get('peer') ?? undefined,
    alpn: parseAlpn(q.get('alpn')),
    fingerprint: q.get('fp') ?? undefined,
    allowInsecure: boolFlag(q.get('allowInsecure') ?? q.get('insecure')),
    realityPublicKey: security === 'reality' ? (q.get('pbk') ?? q.get('publicKey') ?? undefined) : undefined,
    realityShortId: security === 'reality' ? (q.get('sid') ?? q.get('shortId') ?? undefined) : undefined,
  });
}

interface VmessJson {
  ps?: string;
  add?: string;
  port?: string | number;
  id?: string;
  aid?: string | number;
  scy?: string;
  net?: string;
  type?: string;
  host?: string;
  path?: string;
  tls?: string;
  sni?: string;
  alpn?: string;
  fp?: string;
}

function parseVmess(uri: string): ProxyConfig {
  const json = JSON.parse(
    Buffer.from(uri.slice('vmess://'.length).trim(), 'base64').toString('utf8'),
  ) as VmessJson;

  const network = normalizeNetwork(json.net);
  const security: ProxySecurity = json.tls === 'tls' || json.tls === 'reality' ? 'tls' : 'none';
  const server = cleanHost(String(json.add ?? ''));
  const port = portOf(json.port);

  // In vmess links, grpc serviceName and ws/h2 path both live in `path`.
  const transport =
    network === 'grpc'
      ? { grpcServiceName: json.path || undefined }
      : network === 'ws' || network === 'http'
        ? { wsPath: json.path || '/', wsHost: json.host || undefined }
        : {};

  return finalize({
    protocol: 'vmess',
    tag: json.ps?.trim() || `${server}:${port}`,
    server,
    port,
    uuid: json.id,
    alterId: json.aid !== undefined ? Number(json.aid) : 0,
    network,
    ...transport,
    security,
    sni: json.sni || (security === 'tls' ? json.host || undefined : undefined),
    alpn: parseAlpn(json.alpn),
    fingerprint: json.fp || undefined,
  });
}

function parseShadowsocks(uri: string): ProxyConfig {
  // Forms:
  //   ss://base64(method:password)@host:port#tag           (SIP002)
  //   ss://base64(method:password@host:port)#tag           (legacy)
  const withoutScheme = uri.slice('ss://'.length);
  const hashIdx = withoutScheme.indexOf('#');
  const tagRaw = hashIdx >= 0 ? withoutScheme.slice(hashIdx + 1) : '';
  const body = (hashIdx >= 0 ? withoutScheme.slice(0, hashIdx) : withoutScheme).split('?')[0]!;

  let method: string;
  let password: string;
  let server: string;
  let port: number;

  const at = body.lastIndexOf('@');
  if (at >= 0) {
    // SIP002: userinfo (maybe base64) @ host:port
    const userinfo = decodeMaybeBase64(body.slice(0, at));
    const hostPort = body.slice(at + 1);
    [method, password] = splitOnce(userinfo, ':');
    [server, port] = splitHostPort(hostPort);
  } else {
    // legacy: whole body is base64(method:password@host:port)
    const decoded = decodeMaybeBase64(body);
    const at2 = decoded.lastIndexOf('@');
    const cred = decoded.slice(0, at2);
    const hostPort = decoded.slice(at2 + 1);
    [method, password] = splitOnce(cred, ':');
    [server, port] = splitHostPort(hostPort);
  }

  return finalize({
    protocol: 'shadowsocks',
    tag: tagRaw ? safeDecode(tagRaw) : `${server}:${port}`,
    server: cleanHost(server),
    port,
    method,
    password,
    network: 'tcp',
    security: 'none',
  });
}

// --- helpers -----------------------------------------------------------------

function transportParams(network: ProxyNetwork, q: URLSearchParams) {
  if (network === 'ws' || network === 'http') {
    return { wsPath: q.get('path') ?? '/', wsHost: q.get('host') ?? undefined };
  }
  if (network === 'grpc') {
    return { grpcServiceName: q.get('serviceName') ?? q.get('path') ?? undefined };
  }
  return {};
}

function normalizeNetwork(value: string | null | undefined): ProxyNetwork {
  switch ((value ?? 'tcp').toLowerCase()) {
    case 'ws':
    case 'websocket':
      return 'ws';
    case 'grpc':
      return 'grpc';
    case 'http':
    case 'h2':
    case 'http2':
      return 'http';
    default:
      return 'tcp';
  }
}

function normalizeSecurity(value: string | null | undefined): ProxySecurity {
  switch ((value ?? '').toLowerCase()) {
    case 'tls':
    case 'xtls':
      return 'tls';
    case 'reality':
      return 'reality';
    default:
      return 'none';
  }
}

function fragmentTag(hash: string, host: string, port: string): string {
  const t = hash.startsWith('#') ? safeDecode(hash.slice(1)) : '';
  return t.trim() || `${host}:${port}`;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function parseAlpn(value: string | null | undefined): string[] | undefined {
  if (!value) return undefined;
  const list = value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function boolFlag(value: string | null | undefined): boolean | undefined {
  if (value == null) return undefined;
  return value === '1' || value.toLowerCase() === 'true';
}

function cleanHost(host: string): string {
  // URL wraps IPv6 in [..]; sing-box wants the bare address.
  return host.replace(/^\[/, '').replace(/\]$/, '');
}

function portOf(port: string | number | undefined): number {
  const n = Number(port);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) throw new Error(`invalid port: ${port}`);
  return n;
}

function splitOnce(value: string, sep: string): [string, string] {
  const i = value.indexOf(sep);
  return i < 0 ? [value, ''] : [value.slice(0, i), value.slice(i + 1)];
}

function splitHostPort(hostPort: string): [string, number] {
  const i = hostPort.lastIndexOf(':');
  if (i < 0) throw new Error(`invalid host:port: ${hostPort}`);
  return [hostPort.slice(0, i), portOf(hostPort.slice(i + 1))];
}

function decodeMaybeBase64(value: string): string {
  if (value.includes(':') || value.includes('@')) return safeDecode(value);
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/');
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    if (decoded.includes(':')) return decoded;
  } catch {
    // fall through
  }
  return safeDecode(value);
}

/** Validates required fields shared by every protocol. */
function finalize(config: ProxyConfig): ProxyConfig {
  if (!config.server) throw new Error('missing server');
  if (!Number.isInteger(config.port)) throw new Error('missing port');
  return config;
}
