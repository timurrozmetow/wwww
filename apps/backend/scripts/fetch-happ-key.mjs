#!/usr/bin/env node
/**
 * Fetches a Happ "crypt" RSA private key and emits it as an env line for the
 * happ-decoder (BYOK — our backend ships ZERO keys; see happ-decoder.ts).
 *
 * These keys are embedded in the Happ client and were extracted/published by
 * the community, so they are public, inert constants (an RSA private key only
 * DECRYPTS — it grants no access on its own). "Hiding the subscription URL" is
 * obfuscation, not security. This script keeps NO key in source; it pulls it at
 * runtime from a public decryptor repo, so committing the script leaks nothing.
 *
 * Usage:
 *   node scripts/fetch-happ-key.mjs crypt4            # validate + show metadata
 *   node scripts/fetch-happ-key.mjs crypt4 --env      # print HAPP_PRIVATE_KEY_CRYPT4=...
 *   node scripts/fetch-happ-key.mjs crypt4 --env >> ../../deploy/.env.production
 *
 * Override the source with HAPP_KEYS_URL if the upstream repo moves.
 * crypt5 is NOT supported (ChaCha20-Poly1305 hybrid + 34 keys) — use a crypt4 link.
 */
import { createPrivateKey } from 'node:crypto';

const SOURCE_URL =
  process.env.HAPP_KEYS_URL ??
  'https://raw.githubusercontent.com/LeeeeT/happ-decryptor/main/src/decrypt.js';

const VERSION_INDEX = { crypt: 0, crypt2: 1, crypt3: 2, crypt4: 3 };

const version = (process.argv[2] ?? 'crypt4').toLowerCase();
const envMode = process.argv.includes('--env');

if (!(version in VERSION_INDEX)) {
  console.error(`Unsupported version "${version}". Use one of: ${Object.keys(VERSION_INDEX).join(', ')}.`);
  process.exit(1);
}

/** Wraps base64 in 64-char PEM lines. */
function pemLines(b64) {
  return b64.match(/.{1,64}/g)?.join('\n') ?? b64;
}

/** Tries several encodings (PKCS#1/PKCS#8, DER/PEM) and returns a KeyObject. */
function parseKey(b64) {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/');
  const der = Buffer.from(std, 'base64');
  const attempts = [
    () => createPrivateKey({ key: der, format: 'der', type: 'pkcs1' }),
    () => createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
    () => createPrivateKey(`-----BEGIN RSA PRIVATE KEY-----\n${pemLines(std)}\n-----END RSA PRIVATE KEY-----\n`),
    () => createPrivateKey(`-----BEGIN PRIVATE KEY-----\n${pemLines(std)}\n-----END PRIVATE KEY-----\n`),
    () => createPrivateKey(Buffer.from(std, 'base64').toString('utf8')), // already a PEM
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try next */
    }
  }
  throw new Error('could not parse the extracted key in any known encoding');
}

const res = await fetch(SOURCE_URL);
if (!res.ok) {
  console.error(`Fetch failed: HTTP ${res.status} from ${SOURCE_URL}`);
  process.exit(1);
}
const js = await res.text();

// Anchor on `];` to close the array — `]` alone is ambiguous because the
// comments contain "key[0]" etc.
const arrayMatch = js.match(/PKCS1_KEYS_B64\s*=\s*\[([\s\S]*?)\];/);
if (!arrayMatch) {
  console.error('Could not locate PKCS1_KEYS_B64 in the source. The upstream format may have changed.');
  process.exit(1);
}
// Long base64 string literals only (skips short fragments in comments).
const keysB64 = [...arrayMatch[1].matchAll(/["'`]([A-Za-z0-9+/_=-]{50,})["'`]/g)].map((m) => m[1]);
const b64 = keysB64[VERSION_INDEX[version]];
if (!b64) {
  console.error(`Key for ${version} (index ${VERSION_INDEX[version]}) not found; got ${keysB64.length} keys.`);
  process.exit(1);
}

const key = parseKey(b64);
const details = key.asymmetricKeyDetails ?? {};
// Normalize to PKCS#1 PEM so the env value is consistent regardless of source form.
const pem = key.export({ type: 'pkcs1', format: 'pem' }).toString().trim();

if (envMode) {
  // Single-line with literal \n — loadHappKeyringFromEnv() un-escapes it.
  process.stdout.write(`HAPP_PRIVATE_KEY_${version.toUpperCase()}=${pem.replace(/\n/g, '\\n')}\n`);
} else {
  console.error(`✓ ${version}: ${key.asymmetricKeyType?.toUpperCase()} ${details.modulusLength}-bit key parsed OK`);
  console.error(`  source: ${SOURCE_URL}`);
  console.error(`  to install:  node scripts/fetch-happ-key.mjs ${version} --env >> ../../deploy/.env.production`);
  console.error(`  then restart the backend so it picks up HAPP_PRIVATE_KEY_${version.toUpperCase()}.`);
}
