FROM node:22-slim

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
RUN pnpm install --filter web --frozen-lockfile

COPY apps/web ./apps/web

# NEXT_PUBLIC_* is inlined at build time, and the browser (not the container)
# is what calls the API, so this must be the host-visible URL.
ARG NEXT_PUBLIC_API_URL=http://localhost:3001/v1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN pnpm --filter web run build

WORKDIR /app/apps/web
EXPOSE 3000

CMD ["pnpm", "start"]
