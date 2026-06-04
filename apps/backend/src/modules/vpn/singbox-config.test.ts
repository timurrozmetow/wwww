import { describe, expect, it } from 'vitest';
import { parseProxyUri } from './proxy-parser.js';
import { buildSingBoxConfig, buildSingBoxConfigJson } from './singbox-config.js';

const REALITY =
  'vless://uuid-1@example.com:443?type=tcp&security=reality&pbk=PBK&sid=ab12' +
  '&fp=chrome&sni=www.microsoft.com&flow=xtls-rprx-vision#R';

const cfg = (uri: string, opts?: Parameters<typeof buildSingBoxConfig>[1]) =>
  buildSingBoxConfig(parseProxyUri(uri)!, opts);

describe('singbox-config', () => {
  it('wraps an outbound in a tun inbound + direct + route', () => {
    const c = cfg(REALITY);

    expect(c.inbounds).toHaveLength(1);
    expect(c.inbounds[0].type).toBe('tun');
    expect(c.inbounds[0].stack).toBe('gvisor');
    expect(Array.isArray(c.inbounds[0].address)).toBe(true);
    expect(c.inbounds[0].auto_route).toBe(true);

    expect(c.outbounds).toHaveLength(2);
    expect(c.outbounds[0].tag).toBe('proxy');
    expect(c.outbounds[0].type).toBe('vless');
    expect(c.outbounds[0].tls?.reality?.public_key).toBe('PBK');
    expect(c.outbounds[1]).toEqual({ type: 'direct', tag: 'direct' });

    expect(c.route.final).toBe('proxy');
    expect(c.route.auto_detect_interface).toBe(true);
  });

  it('puts sniff + hijack-dns in route rules (1.11+), not on the tun inbound', () => {
    const c = cfg(REALITY);
    const actions = c.route.rules.map((r) => r.action ?? r.protocol);
    expect(c.route.rules.some((r) => r.action === 'sniff')).toBe(true);
    expect(c.route.rules.some((r) => r.action === 'hijack-dns')).toBe(true);
    expect(c.route.rules.some((r) => r.ip_is_private && r.outbound === 'direct')).toBe(true);
    // tun inbound must NOT carry the deprecated sniff field
    expect('sniff' in c.inbounds[0]).toBe(false);
    expect(actions).toContain('sniff');
  });

  it('emits only modern schema fields (no removed keys)', () => {
    const json = buildSingBoxConfigJson(parseProxyUri(REALITY)!);
    // removed in 1.12 / 1.11 — must never appear
    expect(json).not.toContain('inet4_address');
    expect(json).not.toContain('inet6_address');
    expect(json).not.toContain('geoip');
    expect(json).not.toContain('geosite');
    expect(json).not.toContain('"type": "block"');
    expect(json).not.toContain('"type": "dns"');
    // and no leaked numeric tun fd
    expect(json).not.toContain('"fd"');
  });

  it('honours stack/mtu/logLevel overrides', () => {
    const c = cfg(REALITY, { stack: 'system', mtu: 9000, logLevel: 'info' });
    expect(c.inbounds[0].stack).toBe('system');
    expect(c.inbounds[0].mtu).toBe(9000);
    expect(c.log.level).toBe('info');
  });

  it('produces valid, parseable JSON', () => {
    const json = buildSingBoxConfigJson(parseProxyUri(REALITY)!);
    const round = JSON.parse(json);
    expect(round.outbounds[0].flow).toBe('xtls-rprx-vision');
    expect(round.route.final).toBe('proxy');
  });
});
