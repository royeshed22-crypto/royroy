# DUGRIZZ

AI dating communication coach. Upload chat screenshots, get a read on the vibe plus
nine replies — three tones, three intensity levels each — that you can actually send.

## Quick start

Only Docker is required. Nothing else needs installing.

```bash
git clone https://github.com/royeshed22-crypto/dugrizz.git
cd dugrizz
cp .env.example .env
```

Open `.env` and paste a Gemini API key (free — get one at
https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=your-key-here
```

Then:

```bash
docker compose up
```

That's it. Open http://localhost:3000.

The first build takes a few minutes. Afterwards `docker compose up` starts in seconds.
The database schema is applied automatically on boot, so there is no migration step.

| | |
|---|---|
| Web | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger | http://localhost:3001/docs |

To stop: `docker compose down`. Data persists in named volumes — add `-v` to wipe it.

## Stack

- **Web** — Next.js 15 (App Router), Tailwind, Zustand, Framer Motion
- **API** — NestJS 10, Prisma, PostgreSQL, Redis + BullMQ
- **AI** — Google Gemini (vision + analysis + reply generation)

pnpm workspaces: `apps/api` and `apps/web`.

## How it works

1. User uploads 1–10 chat screenshots (`POST /v1/uploads`)
2. An analysis job is queued (`POST /v1/analyses`) so the HTTP request doesn't block
   on the model
3. The worker sends the images to Gemini, which reads the contact's name off the chat
   header, does OCR, extracts the conversation, scores it, and flags what stands out
4. A second call generates nine replies: playful / direct / warm, each at three
   intensity levels
5. The client polls `GET /v1/analyses/:id` until the status is `COMPLETED`

Analyses are linked to a contact automatically using the name from the chat header, so
repeat scans of the same person accumulate. The last five analyses with that person are
fed back into both the analysis and the reply generation, which lets the model judge
direction over time rather than reading each screenshot in isolation.

### Two things worth knowing about the AI layer

**Model fallback.** Any single Gemini alias can sit at 503 for minutes, and the free
tier's daily quota is easy to hit. `AiService` walks a list of models: a 503 is retried
on the same model with backoff, while a 429 skips straight to the next one, since
retrying an exhausted quota only burns more of it. The `lite` models carry a separate
quota and act as the last resort.

**Everything completes together.** Replies are generated *before* the analysis is
marked `COMPLETED`, and messages, replies, and status are written in one transaction.
The client stops polling on `COMPLETED`, so writing that status early would surface an
analysis with no replies attached.

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

Postgres is published on host port **5433** to avoid clashing with a local install.

## Tuning the output

Reply tone and phrasing live entirely in
`apps/api/src/modules/ai/prompts/analysis.prompt.ts`. That file defines what each
intensity level means per tone and carries the anti-cringe rules (no laughing at your
own joke, no slang stacking, no manufactured enthusiasm). Edit it there — no code
changes needed.

## Notes

- Auth is anonymous: the client generates a device UUID and trades it for a JWT
- Uploads are stored on disk with a 24h expiry, in a Docker volume
- Screenshots are sent to Google's Gemini API for processing
