import { constants, generateKeyPairSync, publicEncrypt } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { HappDecodeError } from './happ-decoder.js';
import { resolveSubscription, SubscriptionError } from './subscription.js';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function happLink(payload: string): { link: string; privateKey: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const enc = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(payload, 'utf8'),
  );
  return { link: `happ://crypt4/${enc.toString('base64')}`, privateKey };
}

const VLESS = 'vless://u@one.example.com:443?type=tcp&security=tls&sni=one.example.com#One';
const TROJAN = 'trojan://p@two.example.com:443?sni=two.example.com#Two';
const SUB_URL = 'https://sub.example.com/link';

describe('resolveSubscription', () => {
  it('resolves an inline single proxy URI', async () => {
    const r = await resolveSubscription(VLESS);
    expect(r.sourceKind).toBe('inline');
    expect(r.fetched).toBe(false);
    expect(r.configs).toHaveLength(1);
    expect(r.configs[0]!.server).toBe('one.example.com');
  });

  it('resolves an inline base64 list', async () => {
    const r = await resolveSubscription(b64([VLESS, TROJAN].join('\n')));
    expect(r.sourceKind).toBe('inline');
    expect(r.configs).toHaveLength(2);
  });

  it('fetches a subscription URL and parses the body', async () => {
    const fetcher = vi.fn().mockResolvedValue(b64([VLESS, TROJAN].join('\n')));
    const r = await resolveSubscription(SUB_URL, { fetcher });
    expect(fetcher).toHaveBeenCalledWith(SUB_URL);
    expect(r.sourceKind).toBe('subscription-url');
    expect(r.fetched).toBe(true);
    expect(r.configs).toHaveLength(2);
  });

  it('decodes a happ link whose payload is a subscription URL, then fetches it', async () => {
    const { link, privateKey } = happLink(SUB_URL);
    const fetcher = vi.fn().mockResolvedValue([VLESS, TROJAN].join('\n'));
    const r = await resolveSubscription(link, { keyring: { crypt4: privateKey }, fetcher });
    expect(fetcher).toHaveBeenCalledWith(SUB_URL);
    expect(r.sourceKind).toBe('happ');
    expect(r.fetched).toBe(true);
    expect(r.configs).toHaveLength(2);
  });

  it('decodes a happ link whose payload is an inline proxy list (no fetch)', async () => {
    const { link, privateKey } = happLink([VLESS, TROJAN].join('\n'));
    const fetcher = vi.fn();
    const r = await resolveSubscription(link, { keyring: { crypt4: privateKey }, fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    expect(r.sourceKind).toBe('happ');
    expect(r.fetched).toBe(false);
    expect(r.configs).toHaveLength(2);
  });

  it('propagates a HappDecodeError when the key is missing', async () => {
    const { link } = happLink(SUB_URL);
    await expect(resolveSubscription(link, { keyring: {} })).rejects.toBeInstanceOf(HappDecodeError);
  });

  it('throws SubscriptionError(empty) when nothing parses', async () => {
    await expect(resolveSubscription('not-a-proxy-and-not-a-url')).rejects.toMatchObject({
      name: 'SubscriptionError',
      code: 'empty',
    });
  });

  it('wraps fetch failures as SubscriptionError(fetch_failed)', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(resolveSubscription(SUB_URL, { fetcher })).rejects.toBeInstanceOf(SubscriptionError);
  });

  it('caps the number of configs', async () => {
    const many = Array.from({ length: 50 }, (_, i) => VLESS.replace('one.example.com', `n${i}.com`));
    const r = await resolveSubscription(b64(many.join('\n')), { maxConfigs: 10 });
    expect(r.configs).toHaveLength(10);
  });
});
