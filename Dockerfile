# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Kea web application
#
# Multi stage build producing a small runtime image that runs as a non root
# user. The build needs network access to fetch the fonts Next.js inlines.
# ---------------------------------------------------------------------------

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts=false --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A placeholder is enough for the build: environment is validated at runtime,
# not at build time, and no migration or query runs during the build.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 kea \
 && useradd --system --uid 1001 --gid kea kea

COPY --from=builder --chown=kea:kea /app/public ./public
COPY --from=builder --chown=kea:kea /app/.next/standalone ./
COPY --from=builder --chown=kea:kea /app/.next/static ./.next/static

# Migrations and the scripts that apply them, so a container can run them.
COPY --from=builder --chown=kea:kea /app/src/db/migrations ./src/db/migrations

USER kea
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
