import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load `.env` once, as early as possible. Secrets stay out of code (CLAUDE.md §7).
loadDotenv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Persistence — optional so the skeleton boots without infra in place yet.
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default('redis://127.0.0.1:6379'),

  // Observability — empty DSN disables Sentry.
  SENTRY_DSN: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),

  // Admin auth (Stage 4). Override JWT_SECRET in any real deployment.
  JWT_SECRET: z.string().default('dev-insecure-admin-jwt-secret-change-me'),
  ADMIN_TOKEN_TTL: z.string().default('12h'),

  // Ads / rewards (Stage 2). Default rewarded unit is Google's public TEST id.
  ADMOB_APP_ID: z.string().optional(),
  ADMOB_REWARDED_UNIT_ID: z.string().default('ca-app-pub-3940256099942544/5224354917'),
  // Verify AdMob SSV signatures. Only set false for local test ads (logged loudly).
  ADMOB_SSV_VERIFY: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  // Push / FCM (Stage 6). FCM_ENABLED=false → no-op sender (dev/test); real send
  // needs a service account (kept out of code, §7/§13).
  FCM_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  FCM_PROJECT_ID: z.string().optional(),
  FCM_SERVICE_ACCOUNT: z.string().optional(),

  // Anti-fraud / Play Integrity (Stage 8). Disabled → integrity tokens are not
  // verified (heuristic-only); enable in prod with a project number + creds.
  PLAY_INTEGRITY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  PLAY_INTEGRITY_PROJECT_NUMBER: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Fail fast: never start with an invalid configuration. This runs before the
  // logger exists, so console is the only channel.
  console.error('Invalid environment configuration:', parsed.error.issues);
  throw new Error('Invalid environment configuration');
}

export const env: Env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
export const isDevelopment = env.NODE_ENV === 'development';
