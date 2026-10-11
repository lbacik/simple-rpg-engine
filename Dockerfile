# Prototype image: one self-hosted, long-lived Node process with a persistent
# volume (docs/spec/architecture.md, hosting and stack).
#
#   docker build -t simple-rpg-engine .
#   docker run -p 3000:3000 -v rpg-data:/data simple-rpg-engine
#
# /data holds the SQLite database and the Scenario directory, configured via
# DATABASE_PATH and SCENARIO_DIR. The entrypoint seeds an empty Scenario
# directory from the scenarios bundled into the image, runs `npm run migrate`,
# then starts the standalone server. A Playthrough therefore survives a
# container restart as long as the same volume is mounted.

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

FROM base AS deps
# Toolchain for the better-sqlite3 native module, in case no prebuild matches.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production \
  PORT=3000 \
  HOSTNAME=0.0.0.0 \
  DATABASE_PATH=/data/data.sqlite \
  SCENARIO_DIR=/data/scenarios
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data /app/.scenario-seed \
  && chown -R nextjs:nodejs /data /app
# The standalone server, plus everything `npm run migrate` (tsx and the
# TypeScript sources) needs. Migrations run from the entrypoint, never at
# import time, so they stay safe with several instances later.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/scenarios /app/.scenario-seed
COPY --chown=nextjs:nodejs docker-entrypoint.sh ./
VOLUME /data
EXPOSE 3000
USER nextjs
ENTRYPOINT ["./docker-entrypoint.sh"]
