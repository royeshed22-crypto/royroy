FROM node:22-slim

# Prisma needs OpenSSL at runtime for its query engine.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /app

# Workspace manifests first so `pnpm install` caches across source edits.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
RUN pnpm install --filter api --frozen-lockfile

COPY apps/api ./apps/api

RUN pnpm --filter api exec prisma generate \
    && pnpm --filter api run build

WORKDIR /app/apps/api
EXPOSE 3001

# Sync the schema on boot so a fresh database works with no manual step.
CMD ["sh", "-c", "pnpm exec prisma db push --skip-generate --accept-data-loss && node dist/main"]
