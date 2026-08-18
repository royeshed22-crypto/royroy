# DUGRIZZ

AI dating communication coach. Upload chat screenshots, get a read on the vibe plus
nine replies — three tones at three intensity levels each — that you can actually send.

## Quick start

Only Docker is required. No Node, no pnpm, no Postgres install.

```bash
git clone https://github.com/royeshed22-crypto/dugrizz.git
cd dugrizz
cp .env.example .env
```

Open `.env` and paste a Gemini API key — free, from
https://aistudio.google.com/apikey:

```
GEMINI_API_KEY=your-key-here
```

Then:

```bash
docker compose up
```

Open http://localhost:3000.

The first build takes a few minutes. After that it starts in seconds. The database
schema is applied on boot, so there is no migration step to run.

| | |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/docs |

### Everyday commands

```bash
docker compose up -d          # run in the background
docker compose logs -f api    # follow API logs
docker compose down           # stop (data is kept)
docker compose down -v        # stop and wipe the database
docker compose up --build     # rebuild after changing source
```

That last one matters: the images bake the source in at build time, so code changes
need `--build` to take effect.

## Using it

Onboarding runs once — age gate, consent, then name and goals.

On **Scan**, drop in 1–10 screenshots of a conversation and hit Analyze. A panel tracks
the three stages: uploading, sending to the model, reading the conversation. The button
locks while it works, so a double tap can't fire two analyses.

The result page gives scores for overall, vibe, and interest, a plain-language summary,
a recommended action, and green/red flags.

Below that are three reply cards — playful, direct, warm. Each has a **1/2/3 selector**
that swaps the message in place, from barely-there to full send. Copy puts it on the
clipboard. **New set** regenerates all nine.

Repeat scans of the same person group under one contact automatically.

## Stack

- **Web** — Next.js 15 (App Router), Tailwind, Zustand, Framer Motion
- **API** — NestJS 10, Prisma, PostgreSQL, Redis + BullMQ
- **AI** — Google Gemini (vision + analysis + reply generation)

pnpm workspaces: `apps/api` and `apps/web`.

```
apps/api/
  prisma/schema.prisma              database schema
  src/modules/ai/
    ai.service.ts                   Gemini calls, retry, model fallback
    prompts/analysis.prompt.ts      all prompt text — tune output here
  src/modules/analyses/
    analyses.processor.ts           the BullMQ worker; the real pipeline
    analyses.service.ts             CRUD + reply regeneration
  src/modules/{auth,users,contacts,uploads}/

apps/web/src/
  app/(onboarding)/                 age gate, consent, profile setup
  app/(main)/                       home, scan, contacts, analysis, profile
  components/analysis/
    reply-tone-card.tsx             the intensity switcher
  lib/api.ts                        typed API client
```

## How it works

1. User uploads 1–10 screenshots (`POST /v1/uploads`)
2. An analysis job is queued (`POST /v1/analyses`) so the HTTP request doesn't block
   on the model
3. The worker sends the images to Gemini, which reads the contact's name off the chat
   header, does OCR, extracts the conversation, scores it, and flags what stands out
4. A second call generates nine replies: playful / direct / warm, each at three
   intensity levels
5. The client polls `GET /v1/analyses/:id` until the status is `COMPLETED`

Analyses link to a contact automatically using the name from the chat header, so repeat
scans of the same person accumulate. The last five analyses with that person feed back
into both the analysis and the reply generation, letting the model judge direction over
time rather than reading each screenshot in isolation.

### Two decisions worth knowing about

**Model fallback.** Any single Gemini alias can sit at 503 for minutes, and the free
tier's daily quota is easy to hit. `AiService` walks a list of models: a 503 is retried
on the same model with backoff, while a 429 skips straight to the next one, since
retrying an exhausted quota only burns more of it. The `lite` models carry a separate
quota and act as the last resort.

**Everything completes together.** Replies are generated *before* the analysis is
marked `COMPLETED`, and messages, replies, and status are written in one transaction.
The client stops polling on `COMPLETED`, so writing that status early surfaced an
analysis with no replies attached — which is exactly the bug this ordering fixes.

## Tuning the output

Reply tone and phrasing live entirely in
`apps/api/src/modules/ai/prompts/analysis.prompt.ts`. That file defines what each
intensity level means per tone and carries the anti-cringe rules: don't laugh at your
own joke, don't stack slang, don't manufacture enthusiasm, and let intensity come from
what the message is willing to say rather than from punctuation.

Edit the prompt, then `docker compose up --build`. No code changes needed.

## Troubleshooting

**"Daily Gemini quota is used up"** — the free tier resets at midnight Pacific, around
10:00 Israel time. Until then the app falls back to the `lite` models, which have a
separate quota. Adding billing in Google AI Studio raises the limits substantially.

**Analysis says Failed, or replies don't appear** — check `docker compose logs -f api`.
Gemini returning 503 across every model in the chain at once is the usual cause, and
waiting a minute normally clears it.

**Port already in use** — something else is on 3000, 3001, 5433, or 6379. Change the
left-hand side of the port mappings in `docker-compose.yml`.

**Code changes aren't showing up** — use `docker compose up --build`.

## Local development (without Docker)

Requires Node 20+ and pnpm.

```bash
pnpm install
docker compose up -d postgres redis
```

Create `apps/api/.env`:

```
DATABASE_URL="postgresql://dugrizz:dugrizz_secret@localhost:5433/dugrizz_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev-secret"
JWT_EXPIRES_IN="30d"
GEMINI_API_KEY="your-key-here"
GEMINI_MODEL="gemini-3.6-flash"
GEMINI_FALLBACK_MODELS="gemini-3.5-flash,gemini-flash-latest,gemini-flash-lite-latest"
API_PORT=3001
```

And `apps/web/.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3001/v1
```

Then:

```bash
pnpm --filter=api run db:push
pnpm dev
```

Postgres is published on host port **5433** so it doesn't clash with a local install.

## Notes

- Auth is anonymous: the client generates a device UUID and trades it for a JWT
- Uploads are stored on disk with a 24h expiry, in a Docker volume
- Screenshots are sent to Google's Gemini API for processing
- `.env` is gitignored — every machine needs its own key pasted in
