import { describe, expect, it } from 'vitest';
import { parseProxyUri } from './proxy-parser.js';
import { buildOutbound } from './singbox-outbound.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');
const ob = (uri: string, tag?: string) => buildOutbound(parseProxyUri(uri)!, tag);

describe('singbox-outbound', () => {
  it('builds a vless + reality + vision outbound', () => {
    const o = ob(
      'vless://uuid-1@example.com:443?type=tcp&security=reality&pbk=PBK&sid=ab12' +
        '&fp=chrome&sni=www.microsoft.com&flow=xtls-rprx-vision#R',
      'proxy',
    );
    expect(o.type).toBe('vless');
    expect(o.server).toBe('example.com');
    expect(o.server_port).toBe(443);
    expect(o.uuid).toBe('uuid-1');
    expect(o.flow).toBe('xtls-rprx-vision');
    expect(o.packet_encoding).toBe('xudp');
    expect(o.tls?.enabled).toBe(true);
    expect(o.tls?.server_name).toBe('www.microsoft.com');
    expect(o.tls?.reality?.public_key).toBe('PBK');
    expect(o.tls?.reality?.short_id).toBe('ab12');
    expect(o.tls?.utls?.fingerprint).toBe('chrome');
    expect(o.transport).toBeUndefined(); // tcp
  });

  it('defaults reality utls fingerprint to chrome when absent', () => {
    const o = ob('vless://u@h.com:443?security=reality&pbk=PBK&sid=01#R');
    expect(o.tls?.utls?.fingerprint).toBe('chrome');
  });

  it('builds a vless + ws + tls outbound with Host header', () => {
    const o = ob('vless://u@cdn.com:443?type=ws&security=tls&sni=cdn.com&path=%2Fp&host=edge.com&fp=chrome#W');
    expect(o.transport?.type).toBe('ws');
    expect(o.transport?.path).toBe('/p');
    expect(o.transport?.headers?.Host).toBe('edge.com');
    expect(o.tls?.server_name).toBe('cdn.com');
    expect(o.tls?.reality).toBeUndefined();
  });

  it('builds a vless + grpc outbound', () => {
    const o = ob('vless://u@h.com:443?type=grpc&security=tls&serviceName=svc&sni=h.com#G');
    expect(o.transport?.type).toBe('grpc');
    expect(o.transport?.service_name).toBe('svc');
  });

  it('builds a vmess + ws outbound', () => {
    const json = {
      ps: 'V',
      add: 'v.com',
      port: '443',
      id: 'id-9',
      aid: '0',
      net: 'ws',
      host: 'v.com',
      path: '/vm',
      tls: 'tls',
      sni: 'v.com',
    };
    const o = ob(`vmess://${b64(JSON.stringify(json))}`);
    expect(o.type).toBe('vmess');
    expect(o.security).toBe('auto');
    expect(o.alter_id).toBe(0);
    expect(o.transport?.type).toBe('ws');
    expect(o.tls?.enabled).toBe(true);
  });

  it('builds a trojan outbound', () => {
    const o = ob('trojan://pw@t.com:443?sni=t.com#T');
    expect(o.type).toBe('trojan');
    expect(o.password).toBe('pw');
    expect(o.tls?.server_name).toBe('t.com');
  });

  it('builds a shadowsocks outbound with no tls/transport', () => {
    const o = ob(`ss://${b64('aes-256-gcm:pw')}@s.com:8388#S`);
    expect(o.type).toBe('shadowsocks');
    expect(o.method).toBe('aes-256-gcm');
    expect(o.password).toBe('pw');
    expect(o.tls).toBeUndefined();
    expect(o.transport).toBeUndefined();
  });

  it('omits tls when security=none', () => {
    const o = ob('vless://u@h.com:80?type=tcp&security=none#N');
    expect(o.tls).toBeUndefined();
  });

  it('produces JSON without undefined keys', () => {
    const o = ob('vless://u@h.com:443?security=reality&pbk=PBK&sid=01#R');
    const json = JSON.parse(JSON.stringify(o));
    expect(Object.values(json).every((v) => v !== undefined)).toBe(true);
    expect('insecure' in (json.tls ?? {})).toBe(false);
  });
});
