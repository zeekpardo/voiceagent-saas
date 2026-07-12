# syntax=docker/dockerfile:1
#
# Production image for the voiceagent-saas app (apps/saas).
# Multi-stage: build the monorepo, then ship only Next.js's standalone output.
# Used by Railway (railway.toml -> builder = "dockerfile").
#
# DB schema is managed out-of-band via `prisma db push` (this repo has no
# migrations dir); the schema is pushed to the Railway Postgres before/independent
# of deploys, so the runtime image carries no migrator.

# ---- Stage 1: Build ----
FROM node:22-bookworm-slim AS builder

# openssl is required by Prisma.
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
# Nixpacks/older corepack crashes on Node 22 + pnpm 11; use a current corepack.
RUN npm install -g corepack@latest && corepack enable && corepack prepare pnpm@11.3.0 --activate

WORKDIR /app
COPY . .

# `allowBuilds` in pnpm-workspace.yaml lets prisma/esbuild run their build
# scripts during install (pnpm blocks them by default).
RUN pnpm install --frozen-lockfile

# Generate the Prisma client. A dummy DATABASE_URL is fine — generation never
# connects; it only reads schema.prisma. This repo uses the `prisma-client`
# generator, whose output is plain TS bundled with the app.
RUN cd packages/database && \
    DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    npx prisma generate --no-hints

# Public URLs are inlined into the client bundle at build time, so they must be
# present here (Railway passes service variables as build args). Server-only
# secrets are NOT needed at build; dummies keep any build-time imports happy.
ARG NEXT_PUBLIC_SAAS_URL
ARG NEXT_PUBLIC_MARKETING_URL
ARG NEXT_PUBLIC_DOCS_URL
# next build for this app exceeds Node's default heap in a container; raise it
# to avoid OOM/SIGABRT.
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" \
    BETTER_AUTH_SECRET="dummy-build-secret-not-used-at-runtime" \
    NODE_OPTIONS="--max-old-space-size=4096" \
    NEXT_PUBLIC_SAAS_URL=${NEXT_PUBLIC_SAAS_URL} \
    NEXT_PUBLIC_MARKETING_URL=${NEXT_PUBLIC_MARKETING_URL} \
    NEXT_PUBLIC_DOCS_URL=${NEXT_PUBLIC_DOCS_URL} \
    pnpm --filter saas build

# ---- Stage 2: Runtime ----
FROM node:22-bookworm-slim AS runner

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone server + its static assets and public/ dir. Preserve the
# apps/saas/... path so the start command resolves.
COPY --from=builder /app/apps/saas/.next/standalone ./apps/saas/.next/standalone
COPY --from=builder /app/apps/saas/.next/static ./apps/saas/.next/standalone/apps/saas/.next/static
COPY --from=builder /app/apps/saas/public ./apps/saas/.next/standalone/apps/saas/public

EXPOSE 3000

CMD ["node", "apps/saas/.next/standalone/apps/saas/server.js"]
