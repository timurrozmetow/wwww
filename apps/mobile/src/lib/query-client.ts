import { QueryClient } from '@tanstack/react-query';
import { ApiClientError } from '../api/client';

/**
 * Query client tuned for the unstable / slow networks this app targets
 * (CLAUDE.md §10.9, §14): last-known data is served offline-first, transient
 * failures retry with capped exponential backoff, and 4xx (which won't change)
 * never retry — so a flaky connection doesn't burn battery or mobile data.
 * No per-second polling anywhere: screens rely on the cache + explicit refetch.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        retry: (failureCount, error) => {
          // Client errors are permanent — don't waste battery/data retrying them.
          if (error instanceof ApiClientError && error.status < 500) return false;
          return failureCount < 3;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 15_000),
        staleTime: 60_000,
        // Keep last-known data for a day so a cold start on no/slow network still
        // renders the previous balance, server list and config instantly.
        gcTime: 24 * 60 * 60 * 1000,
        refetchOnReconnect: true,
        refetchOnWindowFocus: false,
      },
      mutations: {
        networkMode: 'offlineFirst',
        // Callers own mutation retries; reward/register are idempotent server-side.
        retry: 0,
      },
    },
  });
}
