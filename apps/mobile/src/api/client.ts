import type { ApiError } from '@vpn/types';
import { API_BASE_URL } from '../config';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

/** Transient transport failure (offline, DNS, reset, timeout) — safe to retry. */
export class NetworkError extends Error {
  constructor(message = 'Network request failed') {
    super(message);
    this.name = 'NetworkError';
  }
}

/** Hard cap on a single request so a half-open socket on a bad network can't hang
 * the UI forever (CLAUDE.md §10.9). */
const DEFAULT_TIMEOUT_MS = 15_000;

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  deviceId?: string;
  timeoutMs?: number;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.deviceId) headers['x-device-id'] = opts.deviceId;
  // Only declare a JSON body when one exists — sending content-type with an empty
  // body makes Fastify reject it (FST_ERR_CTP_EMPTY_JSON_BODY → 400) on body-less
  // POSTs like /api/ads/session/start.
  const hasBody = opts.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let res: Response;
  let text: string;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    // fetch rejects on network failure or on abort (our timeout). Surface a typed
    // retryable error so the query client backs off instead of failing hard.
    throw new NetworkError(err instanceof Error ? err.message : 'Network request failed');
  } finally {
    clearTimeout(timeout);
  }

  const data: unknown = text.length > 0 ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new ApiClientError(res.status, err?.code ?? 'UNKNOWN', err?.message ?? 'Request failed');
  }

  return data as T;
}
