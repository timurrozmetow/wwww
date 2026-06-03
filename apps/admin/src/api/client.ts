import type { ApiError } from '@vpn/types';
import { API_BASE_URL } from '../config';
import { useAuthStore } from '../store/auth';

export class AdminApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AdminApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  // Only declare a JSON body when one exists — sending content-type with an empty
  // body makes Fastify reject it (FST_ERR_CTP_EMPTY_JSON_BODY → 400) on DELETE/etc.
  const hasBody = opts.body !== undefined;
  if (hasBody) headers['content-type'] = 'application/json';

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) useAuthStore.getState().logout();

  const text = await res.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = (data as ApiError | null)?.error;
    throw new AdminApiError(res.status, err?.message ?? 'Request failed');
  }
  return data as T;
}
