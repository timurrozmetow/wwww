# free-vpn-rewards

Free Android VPN with rewarded-ads monetization (1 ad = 30 min). Built for
Turkmenistan / weak networks. Anonymous device profile, server-authoritative
minute balance. See [CLAUDE.md](CLAUDE.md) (how to work) and
[docs/SPEC.md](docs/SPEC.md) (full product spec).

> **Status:** Stage 1 — monorepo skeleton. No business logic yet.

## Stack

pnpm workspaces + Turborepo · TypeScript everywhere · Fastify · MySQL (Drizzle,
later) · Redis (ioredis) · Expo prebuild + React Native · Vite + React +
TailwindCSS v4 · Sentry.

## Layout

```
apps/
  mobile/    Expo (prebuild) + React Native + TS — one empty screen
  backend/   Fastify + TS — GET /health, env config, Sentry + Redis wiring
  admin/     Vite + React + TS + Tailwind v4 — one empty page
packages/
  types/     @vpn/types  — shared API contracts / DTOs / enums
  shared/    @vpn/shared — framework-agnostic helpers
  config/    @vpn/config — shared tsconfig / eslint / prettier presets
docs/        SPEC.md, PROGRESS.md
```

## Prerequisites

- Node ≥ 20, pnpm ≥ 10 (`corepack enable` or `npm i -g pnpm`)
- Docker (for local MySQL + Redis) — optional until backend needs them

## Setup

```bash
pnpm install
cp .env.example .env      # fill placeholders as needed
docker compose up -d      # MySQL + Redis (Redis runs with AOF)
```

## Commands

```bash
pnpm dev          # all apps in dev (turbo)
pnpm build        # build all (turbo; mobile builds via EAS/prebuild, not here)
pnpm typecheck    # tsc --noEmit across the workspace
pnpm lint         # eslint across the workspace
pnpm test         # vitest across the workspace
pnpm format       # prettier --write .

# per app
pnpm --filter @vpn/backend dev
pnpm --filter @vpn/admin dev
pnpm --filter @vpn/mobile start      # Expo dev server
pnpm --filter @vpn/mobile prebuild   # generates android/ (needs Android SDK)
```

Backend listens on `http://localhost:3000` → `GET /health`.

## Notes

- Secrets only in `.env` (never in code); see [.env.example](.env.example).
- `mobile` has no `build` script in CI — real Android builds run via
  `expo prebuild` / EAS with the Android SDK. `pnpm typecheck` covers it.
