// Sentry must be initialized before the rest of the app is imported, so this
// module is the very first import in `index.ts`. No-op when SENTRY_DSN is unset.
import * as Sentry from '@sentry/node';
import { env } from './config/env.js';

if (env.SENTRY_DSN) {
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });
}

export const sentryEnabled = Boolean(env.SENTRY_DSN);
