import { decodeHappLink, isHappLink, type HappKeyring } from './happ-decoder.js';
import { parseSubscription, type ProxyConfig } from './proxy-parser.js';

/**
 * Resolves whatever the admin pasted — a `happ://crypt{N}` link, a subscription
 * URL, or an inline proxy URI / list — into a list of {@link ProxyConfig}.
 *
 *   happ://crypt4 ──decode──▶ (sub-URL ──fetch──▶ | inline) ──parse──▶ ProxyConfig[]
 *
 * The decoded payload and fetched body are NEVER surfaced to clients (§7.2);
 * they become the server `configBlob` (sing-box config) used by the native
 * module only.
 */

export type SubscriptionSourceKind = 'happ' | 'subscription-url' | 'inline';

export type SubscriptionErrorCode = 'empty' | 'fetch_failed';

export class SubscriptionError extends Error {
  constructor(
    readonly code: SubscriptionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SubscriptionError';
  }
}

/** Fetches a subscription URL and returns its body as text. */
export type SubscriptionFetcher = (url: string) => Promise<string>;

export interface ResolveOptions {
  /** Happ private keys (BYOK). Required to resolve a happ:// link. */
  keyring?: HappKeyring;
  /** Override the HTTP fetcher (tests inject a stub). */
  fetcher?: SubscriptionFetcher;
  /** Cap the number of returned configs (defensive against huge lists). */
  maxConfigs?: number;
}

export interface ResolvedSubscription {
  sourceKind: SubscriptionSourceKind;
  /** True when a subscription URL was fetched over the network. */
  fetched: boolean;
  configs: ProxyConfig[];
}

const MAX_CONFIGS_DEFAULT = 200;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 2_000_000;

/**
 * Resolves an admin-supplied source into proxy configs.
 * @throws {HappDecodeError} when a happ link can't be decrypted
 * @throws {SubscriptionError} on fetch failure or an empty result
 */
export async function resolveSubscription(
  input: string,
  opts: ResolveOptions = {},
): Promise<ResolvedSubscription> {
  const { keyring = {}, fetcher = defaultFetcher, maxConfigs = MAX_CONFIGS_DEFAULT } = opts;
  const trimmed = input.trim();

  let kind: SubscriptionSourceKind = 'inline';
  let body = trimmed;

  if (isHappLink(trimmed)) {
    kind = 'happ';
    body = decodeHappLink(trimmed, keyring).payload.trim();
  } else if (isHttpUrl(trimmed)) {
    kind = 'subscription-url';
  }

  // The (possibly decoded) body is either a fetchable URL or an inline payload.
  let text = body;
  let fetched = false;
  if (isHttpUrl(body)) {
    try {
      text = await fetcher(body);
    } catch (err) {
      if (err instanceof SubscriptionError) throw err;
      const reason = err instanceof Error ? err.message : String(err);
      throw new SubscriptionError('fetch_failed', `Subscription fetch failed: ${reason}`);
    }
    fetched = true;
  }

  const configs = parseSubscription(text).slice(0, maxConfigs);
  if (configs.length === 0) {
    throw new SubscriptionError('empty', 'No usable proxy configs found in the source');
  }
  return { sourceKind: kind, fetched, configs };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

/** Default fetcher: global fetch with a timeout and a body-size cap. */
const defaultFetcher: SubscriptionFetcher = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'sing-box', accept: '*/*' },
    });
    if (!res.ok) {
      throw new SubscriptionError('fetch_failed', `Subscription fetch failed: HTTP ${res.status}`);
    }
    const body = await res.text();
    if (body.length > MAX_BODY_BYTES) {
      throw new SubscriptionError('fetch_failed', 'Subscription body too large');
    }
    return body;
  } catch (err) {
    if (err instanceof SubscriptionError) throw err;
    const reason = err instanceof Error ? err.message : String(err);
    throw new SubscriptionError('fetch_failed', `Subscription fetch failed: ${reason}`);
  } finally {
    clearTimeout(timer);
  }
};
