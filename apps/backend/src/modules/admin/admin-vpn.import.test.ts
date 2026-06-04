import { constants, generateKeyPairSync, publicEncrypt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryVpnProviderRepository } from '../vpn/vpn-provider.repository.js';
import { InMemoryVpnServerRepository } from '../vpn/vpn-server.repository.js';
import { AdminVpnService } from './admin-vpn.service.js';
import { InMemoryAuditLogRepository } from './admin.repository.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

const VLESS_NL =
  'vless://11111111-1111-1111-1111-111111111111@nl.example.com:443' +
  '?type=tcp&security=reality&pbk=PBK&sid=ab12&fp=chrome&sni=www.microsoft.com' +
  '&flow=xtls-rprx-vision#🇳🇱 Amsterdam';
const TROJAN_US = 'trojan://pw@us.example.com:443?sni=us.example.com#US Node';

function makeKeyPair() {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** Block-chained crypt4 link, as a Happ panel produces. */
function makeHappCrypt4(payload: string, publicKey: string): string {
  const max = 256 - 11;
  const buf = Buffer.from(payload, 'utf8');
  const blocks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += max) {
    blocks.push(
      publicEncrypt(
        { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
        buf.subarray(i, i + max),
      ),
    );
  }
  return `happ://crypt4/${Buffer.concat(blocks).toString('base64')}`;
}

async function setup() {
  const providers = new InMemoryVpnProviderRepository();
  const servers = new InMemoryVpnServerRepository();
  const audit = new InMemoryAuditLogRepository();
  const provider = await providers.create({ name: 'Test', type: 'happ' });
  return { providers, servers, audit, provider };
}

describe('AdminVpnService.importFromSource', () => {
  it('imports an inline list, infers country, stores a sing-box configBlob', async () => {
    const { providers, servers, audit, provider } = await setup();
    const svc = new AdminVpnService(providers, servers, audit);

    const result = await svc.importFromSource(1, {
      providerId: provider.id,
      source: b64([VLESS_NL, TROJAN_US].join('\n')),
    });

    expect(result.sourceKind).toBe('inline');
    expect(result.total).toBe(2);
    const nl = result.imported.find((s) => s.host === 'nl.example.com')!;
    const us = result.imported.find((s) => s.host === 'us.example.com')!;
    expect(nl.country).toBe('NL'); // from flag emoji
    expect(us.country).toBe('US'); // from "US" token

    // configBlob is stored (not exposed on AdminVpnServer) and is a real config
    const row = await servers.findById(nl.id);
    const config = JSON.parse(row!.configBlob!);
    expect(config.inbounds[0].type).toBe('tun');
    expect(config.outbounds[0].type).toBe('vless');
    expect(config.outbounds[0].tls.reality.public_key).toBe('PBK');
  });

  it('imports a happ:// link when the matching key is configured', async () => {
    const { providers, servers, audit, provider } = await setup();
    const { publicKey, privateKey } = makeKeyPair();
    const link = makeHappCrypt4([VLESS_NL, TROJAN_US].join('\n'), publicKey);
    const svc = new AdminVpnService(providers, servers, audit, { crypt4: privateKey });

    const result = await svc.importFromSource(1, { providerId: provider.id, source: link });

    expect(result.sourceKind).toBe('happ');
    expect(result.total).toBe(2);
  });

  it('fetches a subscription URL via the injected fetcher', async () => {
    const { providers, servers, audit, provider } = await setup();
    const fetcher = async () => b64([VLESS_NL].join('\n'));
    const svc = new AdminVpnService(providers, servers, audit, {}, fetcher);

    const result = await svc.importFromSource(1, {
      providerId: provider.id,
      source: 'https://sub.example.com/x',
    });

    expect(result.sourceKind).toBe('subscription-url');
    expect(result.total).toBe(1);
  });

  it('uses the fallback country when none can be inferred', async () => {
    const { providers, servers, audit, provider } = await setup();
    const svc = new AdminVpnService(providers, servers, audit);
    const noCountry = 'vless://u@h.example.com:443?type=tcp&security=tls&sni=h.example.com#node';

    const result = await svc.importFromSource(1, {
      providerId: provider.id,
      source: noCountry,
      country: 'TM',
    });

    expect(result.imported[0]!.country).toBe('TM');
  });

  it('rejects a happ link with no key as a 400 ValidationError', async () => {
    const { providers, servers, audit, provider } = await setup();
    const { publicKey } = makeKeyPair();
    const link = makeHappCrypt4(VLESS_NL, publicKey);
    const svc = new AdminVpnService(providers, servers, audit); // no keyring

    await expect(
      svc.importFromSource(1, { providerId: provider.id, source: link }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws NotFound for an unknown provider', async () => {
    const { providers, servers, audit } = await setup();
    const svc = new AdminVpnService(providers, servers, audit);
    await expect(
      svc.importFromSource(1, { providerId: 'nope', source: VLESS_NL }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
