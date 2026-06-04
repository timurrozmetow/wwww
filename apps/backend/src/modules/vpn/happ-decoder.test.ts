import { constants, generateKeyPairSync, publicEncrypt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decodeHappLink,
  HappDecodeError,
  isHappLink,
  loadHappKeyringFromEnv,
  type HappKeyring,
  type HappVersion,
} from './happ-decoder.js';

/** Generates an RSA keypair as PEM strings (mirrors how a real Happ key is stored). */
function makeKeyPair(): { publicKey: string; privateKey: string } {
  return generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/** Encrypts a payload exactly like a Happ panel would, producing a happ://crypt{N} link. */
function makeHappLink(version: HappVersion, payload: string, publicKey: string): string {
  const encrypted = publicEncrypt(
    { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
    Buffer.from(payload, 'utf8'),
  );
  return `happ://${version}/${encrypted.toString('base64')}`;
}

/** Block-chained encryption (as Happ does for URLs longer than one RSA block). */
function makeChainedB64(payload: string, publicKey: string, modBytes = 256): string {
  const maxChunk = modBytes - 11; // PKCS#1 v1.5 overhead
  const buf = Buffer.from(payload, 'utf8');
  const blocks: Buffer[] = [];
  for (let i = 0; i < buf.length; i += maxChunk) {
    blocks.push(
      publicEncrypt(
        { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
        buf.subarray(i, i + maxChunk),
      ),
    );
  }
  return Buffer.concat(blocks).toString('base64');
}

const SUB_URL = 'https://sub.example.com/api/v1/client/subscribe?token=abc123';

describe('happ-decoder', () => {
  it('round-trips a crypt4 link with the matching private key', () => {
    const { publicKey, privateKey } = makeKeyPair();
    const link = makeHappLink('crypt4', SUB_URL, publicKey);

    const result = decodeHappLink(link, { crypt4: privateKey });

    expect(result.version).toBe('crypt4');
    expect(result.usedVersion).toBe('crypt4');
    expect(result.payload).toBe(SUB_URL);
  });

  it('decodes every crypt version', () => {
    for (const version of ['crypt', 'crypt2', 'crypt3', 'crypt4'] as HappVersion[]) {
      const { publicKey, privateKey } = makeKeyPair();
      const link = makeHappLink(version, `sub-for-${version}`, publicKey);
      const keyring: HappKeyring = { [version]: privateKey };
      expect(decodeHappLink(link, keyring).payload).toBe(`sub-for-${version}`);
    }
  });

  it('falls back across versions when the link prefix is mislabelled', () => {
    // Panel labels it crypt2 but the data is actually encrypted for the crypt4 key.
    const { publicKey, privateKey } = makeKeyPair();
    const encrypted = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(SUB_URL, 'utf8'),
    );
    const link = `happ://crypt2/${encrypted.toString('base64')}`;

    const result = decodeHappLink(link, { crypt4: privateKey });

    expect(result.version).toBe('crypt2'); // as labelled
    expect(result.usedVersion).toBe('crypt4'); // key that actually worked
    expect(result.payload).toBe(SUB_URL);
  });

  it('throws invalid_link for a non-happ string', () => {
    expect(() => decodeHappLink('vless://nope', { crypt4: 'x' })).toThrowError(HappDecodeError);
    try {
      decodeHappLink('https://example.com', {});
    } catch (e) {
      expect((e as HappDecodeError).code).toBe('invalid_link');
    }
  });

  it('throws no_key when no key is configured for any version', () => {
    const { publicKey } = makeKeyPair();
    const link = makeHappLink('crypt4', SUB_URL, publicKey);
    try {
      decodeHappLink(link, {});
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HappDecodeError);
      expect((e as HappDecodeError).code).toBe('no_key');
    }
  });

  it('throws decrypt_failed when the configured key is wrong', () => {
    const { publicKey } = makeKeyPair(); // panel's key
    const { privateKey: otherPrivate } = makeKeyPair(); // unrelated key we hold
    const link = makeHappLink('crypt4', SUB_URL, publicKey);
    try {
      decodeHappLink(link, { crypt4: otherPrivate });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HappDecodeError);
      expect((e as HappDecodeError).code).toBe('decrypt_failed');
    }
  });

  it('isHappLink recognises only valid happ crypt links', () => {
    expect(isHappLink('happ://crypt4/abc')).toBe(true);
    expect(isHappLink('  happ://crypt/abc  ')).toBe(true);
    expect(isHappLink('happ://crypt5/abc')).toBe(false); // chacha, not handled here
    expect(isHappLink('vless://abc')).toBe(false);
    expect(isHappLink('happ://crypt4/')).toBe(false);
  });

  it('loadHappKeyringFromEnv reads keys and un-escapes \\n in PEMs', () => {
    const { privateKey } = makeKeyPair();
    const singleLine = privateKey.replace(/\n/g, '\\n');
    const ring = loadHappKeyringFromEnv({
      HAPP_PRIVATE_KEY_CRYPT4: singleLine,
      HAPP_PRIVATE_KEY_CRYPT: '   ', // blank → ignored
    } as NodeJS.ProcessEnv);

    expect(ring.crypt4).toContain('-----BEGIN PRIVATE KEY-----');
    expect(ring.crypt4).toContain('\n');
    expect(ring.crypt).toBeUndefined();
  });

  it('decodes a multi-block (chained) payload longer than one RSA block', () => {
    const { publicKey, privateKey } = makeKeyPair();
    const longUrl = `https://sub.example.com/api/v1/client/subscribe?token=${'x'.repeat(400)}`;
    const link = `happ://crypt4/${makeChainedB64(longUrl, publicKey)}`;

    const result = decodeHappLink(link, { crypt4: privateKey });

    expect(result.payload).toBe(longUrl);
    expect(result.payload.length).toBeGreaterThan(245); // spanned more than one block
  });

  it('decodes a URL-safe base64 payload (- _ alphabet, no padding)', () => {
    const { publicKey, privateKey } = makeKeyPair();
    const enc = publicEncrypt(
      { key: publicKey, padding: constants.RSA_PKCS1_PADDING },
      Buffer.from(SUB_URL, 'utf8'),
    ).toString('base64');
    const urlSafe = enc.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const link = `happ://crypt4/${urlSafe}`;

    expect(decodeHappLink(link, { crypt4: privateKey }).payload).toBe(SUB_URL);
  });

  it('rejects crypt5 links with unsupported_version', () => {
    try {
      decodeHappLink('happ://crypt5/AAAABBBB', { crypt4: 'x' });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(HappDecodeError);
      expect((e as HappDecodeError).code).toBe('unsupported_version');
    }
  });

  it('end-to-end: env keyring decodes a link', () => {
    const { publicKey, privateKey } = makeKeyPair();
    const link = makeHappLink('crypt4', SUB_URL, publicKey);
    const ring = loadHappKeyringFromEnv({
      HAPP_PRIVATE_KEY_CRYPT4: privateKey.replace(/\n/g, '\\n'),
    } as NodeJS.ProcessEnv);

    expect(decodeHappLink(link, ring).payload).toBe(SUB_URL);
  });
});
