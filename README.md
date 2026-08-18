# DUGRIZZ

AI dating communication coach. Upload chat screenshots, get a read on the vibe plus three replies you can actually send.

## Stack

- **Web** — Next.js 15 (App Router), Tailwind, Zustand, Framer Motion
- **API** — NestJS 10, Prisma, PostgreSQL, Redis + BullMQ
- **AI** — Google Gemini (vision + analysis + reply generation)

Monorepo via pnpm workspaces: `apps/api` and `apps/web`.

## Setup

**Requirements:** Node 20+, pnpm, Docker Desktop

```bash
pnpm install
```

Create `apps/api/.env` and `apps/web/.env.local` — see `.env.example` for both.
You need a Gemini API key from https://aistudio.google.com/apikey (free tier is fine).

Start Postgres and Redis:

```bash
docker-compose up -d
```

Create the database tables (first run only):

```bash
pnpm --filter=api run db:push
```

## Running

```bash
pnpm dev
```

- Web — http://localhost:3000
- API — http://localhost:3001
- Swagger — http://localhost:3001/docs

## How it works

1. User uploads 1–10 chat screenshots (`POST /v1/uploads`)
2. An analysis job is queued (`POST /v1/analyses`) — BullMQ, so the HTTP request doesn't block on the model
3. The worker sends the images to Gemini, which does OCR, extracts the conversation, scores it, and flags anything notable
4. A second Gemini call generates three replies (playful / direct / warm)
5. The client polls `GET /v1/analyses/:id` until the status is `COMPLETED`

Gemini returns 503 under load fairly often, so `AiService.withRetry` retries transient
failures with exponential backoff, and the processor only marks an analysis `FAILED`
once BullMQ has exhausted its attempts.

## Notes

- Auth is anonymous: the client generates a device UUID and trades it for a JWT
- Uploads are stored on local disk under `apps/api/uploads/` with a 24h expiry
- Reply tone and phrasing are controlled entirely by the prompts in
  `apps/api/src/modules/ai/prompts/analysis.prompt.ts` — that file is where you tune
  how casual or formal the output sounds
- Docker maps Postgres to host port **5433** to avoid clashing with a local Postgres install
