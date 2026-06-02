# Backend control-plane image. Build context = repo ROOT (pnpm monorepo).
#   docker build -f deploy/Dockerfile -t vpn-backend .
# Includes devDeps so the management scripts (db:migrate / vpn:seed / ads:seed /
# admin:create — drizzle-kit + tsx) run via `docker compose run --rm backend ...`.

FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
# Install only the backend and its workspace dependencies (skips mobile/admin).
RUN pnpm install --frozen-lockfile --filter @vpn/backend...
# Build @vpn/types (dist) then the backend (tsc → dist).
RUN pnpm --filter @vpn/types build && pnpm --filter @vpn/backend build

FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/backend
EXPOSE 3000
# Sentry is initialised first (src/index.ts → instrument.js); graceful SIGTERM.
CMD ["node", "dist/index.js"]
