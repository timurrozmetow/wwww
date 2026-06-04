import { describe, expect, it } from 'vitest';
import { isProxyUri, parseProxyUri, parseSubscription } from './proxy-parser.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

describe('proxy-parser', () => {
  it('parses vless + reality + vision', () => {
    const uri =
      'vless://11111111-2222-3333-4444-555555555555@example.com:443' +
      '?type=tcp&security=reality&pbk=PUBKEYxyz&sid=ab12&fp=chrome' +
      '&sni=www.microsoft.com&flow=xtls-rprx-vision#My%20Reality';
    const c = parseProxyUri(uri)!;

    expect(c.protocol).toBe('vless');
    expect(c.tag).toBe('My Reality');
    expect(c.server).toBe('example.com');
    expect(c.port).toBe(443);
    expect(c.uuid).toBe('11111111-2222-3333-4444-555555555555');
    expect(c.network).toBe('tcp');
    expect(c.security).toBe('reality');
    expect(c.flow).toBe('xtls-rprx-vision');
    expect(c.sni).toBe('www.microsoft.com');
    expect(c.fingerprint).toBe('chrome');
    expect(c.realityPublicKey).toBe('PUBKEYxyz');
    expect(c.realityShortId).toBe('ab12');
  });

  it('parses vless + ws + tls', () => {
    const uri =
      'vless://abc@cdn.example.com:443?type=ws&security=tls' +
      '&sni=cdn.example.com&path=%2Fvless&host=edge.example.com&fp=chrome#WS';
    const c = parseProxyUri(uri)!;

    expect(c.network).toBe('ws');
    expect(c.security).toBe('tls');
    expect(c.wsPath).toBe('/vless');
    expect(c.wsHost).toBe('edge.example.com');
    expect(c.realityPublicKey).toBeUndefined();
  });

  it('parses vless + grpc', () => {
    const uri = 'vless://abc@h.example.com:443?type=grpc&security=tls&serviceName=mygrpc&sni=h.example.com#G';
    const c = parseProxyUri(uri)!;
    expect(c.network).toBe('grpc');
    expect(c.grpcServiceName).toBe('mygrpc');
  });

  it('parses trojan (defaults to tls)', () => {
    const c = parseProxyUri('trojan://pass123@t.example.com:443?sni=t.example.com#Trojan')!;
    expect(c.protocol).toBe('trojan');
    expect(c.password).toBe('pass123');
    expect(c.security).toBe('tls');
    expect(c.sni).toBe('t.example.com');
    expect(c.port).toBe(443);
  });

  it('parses vmess base64 JSON (ws + tls)', () => {
    const json = {
      v: '2',
      ps: 'VMess WS',
      add: 'vmess.example.com',
      port: '443',
      id: '99999999-8888-7777-6666-555555555555',
      aid: '0',
      net: 'ws',
      type: 'none',
      host: 'vmess.example.com',
      path: '/vm',
      tls: 'tls',
      sni: 'vmess.example.com',
    };
    const c = parseProxyUri(`vmess://${b64(JSON.stringify(json))}`)!;

    expect(c.protocol).toBe('vmess');
    expect(c.tag).toBe('VMess WS');
    expect(c.server).toBe('vmess.example.com');
    expect(c.uuid).toBe('99999999-8888-7777-6666-555555555555');
    expect(c.alterId).toBe(0);
    expect(c.network).toBe('ws');
    expect(c.wsPath).toBe('/vm');
    expect(c.security).toBe('tls');
  });

  it('parses shadowsocks SIP002 (base64 userinfo)', () => {
    const uri = `ss://${b64('aes-256-gcm:secretpass')}@ss.example.com:8388#SS%20Node`;
    const c = parseProxyUri(uri)!;
    expect(c.protocol).toBe('shadowsocks');
    expect(c.method).toBe('aes-256-gcm');
    expect(c.password).toBe('secretpass');
    expect(c.server).toBe('ss.example.com');
    expect(c.port).toBe(8388);
    expect(c.tag).toBe('SS Node');
  });

  it('parses shadowsocks legacy (whole-body base64)', () => {
    const uri = `ss://${b64('chacha20-ietf-poly1305:pw@legacy.example.com:8388')}#Legacy`;
    const c = parseProxyUri(uri)!;
    expect(c.method).toBe('chacha20-ietf-poly1305');
    expect(c.password).toBe('pw');
    expect(c.server).toBe('legacy.example.com');
    expect(c.port).toBe(8388);
  });

  it('returns null for garbage / unknown schemes', () => {
    expect(parseProxyUri('https://example.com')).toBeNull();
    expect(parseProxyUri('vless://')).toBeNull();
    expect(parseProxyUri('not a uri')).toBeNull();
  });

  it('isProxyUri recognises supported schemes only', () => {
    expect(isProxyUri('vless://x')).toBe(true);
    expect(isProxyUri('  trojan://x ')).toBe(true);
    expect(isProxyUri('happ://crypt4/x')).toBe(false);
  });

  it('parses a base64 subscription blob into multiple configs', () => {
    const list = [
      'vless://a@one.example.com:443?type=tcp&security=tls&sni=one.example.com#One',
      'trojan://p@two.example.com:443?sni=two.example.com#Two',
      'garbage-line-ignored',
    ].join('\n');
    const configs = parseSubscription(b64(list));

    expect(configs).toHaveLength(2);
    expect(configs[0]!.server).toBe('one.example.com');
    expect(configs[1]!.protocol).toBe('trojan');
  });

  it('parses a plain-text (non-base64) subscription list', () => {
    const list = 'vless://a@p.example.com:443?type=ws&security=tls&path=%2Fx#P\n\n';
    const configs = parseSubscription(list);
    expect(configs).toHaveLength(1);
    expect(configs[0]!.network).toBe('ws');
  });
});
