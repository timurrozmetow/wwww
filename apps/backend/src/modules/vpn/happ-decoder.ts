import { constants, createPrivateKey, type KeyObject, privateDecrypt } from 'node:crypto';

/**
 * Happ "crypt" deep-link decoder.
 *
 * Happ wraps a subscription URL (or raw config payload) in an RSA-encrypted
 * `happ://crypt{N}/<base64>` link. The RSA *private* keys are embedded in the
 * Happ client and were extracted by the community, so they are effectively
 * public constants — but we treat them as operator-supplied secrets (BYOK):
 * they live ONLY in env (`HAPP_PRIVATE_KEY_CRYPT*`), never in source, per
 * CLAUDE.md §7.1. This module ships ZERO keys and has no external dependency —
 * it is ~node:crypto only, so there is no third-party package to trust in the
 * money backend.
 *
 * crypt5+ uses ChaCha20-Poly1305 (symmetric) and is intentionally NOT handled
 * here — add it as a separate path if/when a crypt5 link appears.
 *
 * The decoded payload is NEVER surfaced to end users (§7.2); it feeds the
 * subscription resolver → sing-box config → native module.
 */

export type HappVersion = 'crypt' | 'crypt2' | 'crypt3' | 'crypt4';

const HAPP_LINK_RE = /^happ:\/\/(crypt|crypt2|crypt3|crypt4)\/(.+)$/;
const ANY_HAPP_RE = /^happ:\/\/(crypt\d*)\//;
const VERSION_ORDER: readonly HappVersion[] = ['crypt', 'crypt2', 'crypt3', 'crypt4'];

/** PEM private keys per crypt version. Missing versions simply aren't decodable. */
export type HappKeyring = Partial<Record<HappVersion, string>>;

export type HappDecodeErrorCode =
  | 'invalid_link'
  | 'unsupported_version'
  | 'no_key'
  | 'decrypt_failed';

export class HappDecodeError extends Error {
  constructor(
    readonly code: HappDecodeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HappDecodeError';
  }
}

export interface HappDecodeResult {
  /** Version declared in the link prefix. */
  version: HappVersion;
  /** Version of the key that actually decrypted it (panels sometimes mislabel). */
  usedVersion: HappVersion;
  /** Decrypted plaintext — a subscription URL or raw config payload. */
  payload: string;
}

/** True for a well-formed `happ://crypt{,2,3,4}/<base64>` link. */
export function isHappLink(value: string): boolean {
  return HAPP_LINK_RE.test(value.trim());
}

/**
 * Decrypts a `happ://crypt{N}` link with the given keyring.
 * Tries the labelled version's key first, then the rest as a fallback.
 * @throws {HappDecodeError} invalid_link | no_key | decrypt_failed
 */
export function decodeHappLink(link: string, keyring: HappKeyring): HappDecodeResult {
  const trimmed = link.trim();
  const match = trimmed.match(HAPP_LINK_RE);
  if (!match) {
    // crypt5+ is a different scheme (ChaCha20-Poly1305 hybrid) we don't handle.
    const any = trimmed.match(ANY_HAPP_RE);
    if (any) {
      throw new HappDecodeError(
        'unsupported_version',
        `Happ ${any[1]} links are not supported (only crypt…crypt4)`,
      );
    }
    throw new HappDecodeError('invalid_link', 'Not a happ://crypt{N} link');
  }

  const version = match[1] as HappVersion;
  // Happ uses URL-safe base64; normalize to standard before decoding.
  const data = Buffer.from(match[2]!.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

  const tryOrder: HappVersion[] = [version, ...VERSION_ORDER.filter((v) => v !== version)];
  if (!tryOrder.some((v) => keyring[v])) {
    throw new HappDecodeError(
      'no_key',
      `No Happ private key configured (set HAPP_PRIVATE_KEY_${version.toUpperCase()})`,
    );
  }

  for (const v of tryOrder) {
    const pem = keyring[v];
    if (!pem) continue;
    const text = tryDecrypt(pem, data);
    if (text !== null) return { version, usedVersion: v, payload: text };
  }
  throw new HappDecodeError('decrypt_failed', 'No configured key could decrypt this link');
}

/**
 * Decrypts a Happ ciphertext with a single key. The payload is BLOCK-CHAINED:
 * because a subscription URL can exceed one RSA block, Happ encrypts it in
 * fixed-size blocks of `modulus/8` bytes (128 for RSA-1024, 512 for RSA-4096)
 * and concatenates the ciphertexts. We split on the key's modulus size,
 * RSA-decrypt each block, and concat the plaintext. Returns the UTF-8 string,
 * or null if this key clearly isn't the right one.
 */
function tryDecrypt(pem: string, data: Buffer): string | null {
  let key: KeyObject;
  try {
    key = createPrivateKey(pem);
  } catch {
    return null; // malformed PEM
  }
  const modBytes = (key.asymmetricKeyDetails?.modulusLength ?? 0) >> 3;
  // Ciphertext must be a whole number of this key's RSA blocks, else wrong key.
  if (!modBytes || data.length === 0 || data.length % modBytes !== 0) return null;

  const parts: Buffer[] = [];
  for (let offset = 0; offset < data.length; offset += modBytes) {
    const decrypted = decryptBlock(key, data.subarray(offset, offset + modBytes));
    if (decrypted === null) return null; // a block failed → not our key
    parts.push(decrypted);
  }
  const text = Buffer.concat(parts).toString('utf8');
  return looksPrintable(text) ? text : null;
}

/**
 * Decrypts one RSA block. Standard PKCS#1 v1.5 first; if the core rejects the
 * padding (some keys/links need it) fall back to a manual NO_PADDING unwrap —
 * mirroring the reference Happ decryptors.
 */
function decryptBlock(key: KeyObject, block: Buffer): Buffer | null {
  try {
    return privateDecrypt({ key, padding: constants.RSA_PKCS1_PADDING }, block);
  } catch {
    // manual NO_PADDING unwrap (yields garbage for a wrong key — caller's
    // printable check after concat is the final guard)
    try {
      return stripPkcs1(privateDecrypt({ key, padding: constants.RSA_NO_PADDING }, block));
    } catch {
      return null;
    }
  }
}

/** Strips a PKCS#1 v1.5 block `00 02 <nonzero padding> 00 <data>` → data. */
function stripPkcs1(raw: Buffer): Buffer | null {
  for (let i = 2; i < raw.length; i++) {
    if (raw[i] === 0x00) return raw.subarray(i + 1);
  }
  return null;
}

/**
 * Guards against a wrong-key NO_PADDING decrypt returning binary garbage.
 * Happ payloads are URLs/JSON (printable text), so we require it to be mostly
 * printable and free of replacement characters.
 */
function looksPrintable(text: string): boolean {
  if (text.length === 0) return false;
  let bad = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    // control chars (except tab/newline/CR) and the UTF-8 replacement char
    if (c === 0xfffd || (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d)) bad++;
  }
  return bad / text.length < 0.05;
}

const ENV_KEYS: Record<HappVersion, string> = {
  crypt: 'HAPP_PRIVATE_KEY_CRYPT',
  crypt2: 'HAPP_PRIVATE_KEY_CRYPT2',
  crypt3: 'HAPP_PRIVATE_KEY_CRYPT3',
  crypt4: 'HAPP_PRIVATE_KEY_CRYPT4',
};

/**
 * Builds a keyring from env. PEMs may be stored single-line with literal `\n`
 * (the usual way to put a multiline key in a `.env`) — they're un-escaped here.
 */
export function loadHappKeyringFromEnv(env: NodeJS.ProcessEnv = process.env): HappKeyring {
  const ring: HappKeyring = {};
  for (const version of VERSION_ORDER) {
    const raw = env[ENV_KEYS[version]];
    if (raw && raw.trim()) ring[version] = normalizePem(raw);
  }
  return ring;
}

function normalizePem(value: string): string {
  const v = value.trim();
  return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v;
}
