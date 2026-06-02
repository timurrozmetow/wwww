import { verify as cryptoVerify } from 'node:crypto';

/** Verifies an ad network's server-side-verification (SSV) signature. */
export interface SsvVerifier {
  verify(content: string, signatureBase64Url: string, keyId: string): Promise<boolean>;
}

interface AdMobKeyEntry {
  keyId: number;
  pem: string;
  base64: string;
}

const ADMOB_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';
const KEYS_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Real AdMob SSV verifier: ECDSA-SHA256 over the callback query string (the part
 * before `&signature=`), using Google's published verifier keys selected by
 * `key_id`. Keys are fetched and cached. See Google's SSV documentation.
 */
export class AdMobSsvVerifier implements SsvVerifier {
  private keys: Map<string, string> | null = null;
  private fetchedAt = 0;

  private async getKey(keyId: string): Promise<string | null> {
    if (!this.keys || Date.now() - this.fetchedAt > KEYS_TTL_MS) {
      const res = await fetch(ADMOB_KEYS_URL);
      if (!res.ok) throw new Error(`failed to fetch AdMob verifier keys: ${res.status}`);
      const body = (await res.json()) as { keys: AdMobKeyEntry[] };
      this.keys = new Map(body.keys.map((k) => [String(k.keyId), k.pem]));
      this.fetchedAt = Date.now();
    }
    return this.keys.get(keyId) ?? null;
  }

  async verify(content: string, signatureBase64Url: string, keyId: string): Promise<boolean> {
    const pem = await this.getKey(keyId);
    if (!pem) return false;
    const signature = Buffer.from(
      signatureBase64Url.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );
    try {
      return cryptoVerify('sha256', Buffer.from(content, 'utf8'), pem, signature);
    } catch {
      return false;
    }
  }
}

/** No-op verifier for local TEST ads (ADMOB_SSV_VERIFY=false). NEVER for prod. */
export class NoopSsvVerifier implements SsvVerifier {
  async verify(): Promise<boolean> {
    return true;
  }
}
