# Production image (works on any Docker host: IONOS VPS, AWS ECS/Fargate, DigitalOcean, Fly…)
# Build: docker build -t ledger .   Run: docker run -p 3000:3000 --env-file .env ledger
# Full stack on one server (Postgres + migrations + app + HTTPS): see deploy/README.md

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# One-shot migration job: `docker build --target migrate -t ledger-migrate .`
FROM node:22-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY scripts/migrate.mjs ./scripts/migrate.mjs
COPY db/migrations ./db/migrations
CMD ["node", "scripts/migrate.mjs"]

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S ledger && adduser -S ledger -G ledger
COPY --from=build --chown=ledger:ledger /app/.next/standalone ./
COPY --from=build --chown=ledger:ledger /app/.next/static ./.next/static
COPY --from=build --chown=ledger:ledger /app/public ./public
USER ledger
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
