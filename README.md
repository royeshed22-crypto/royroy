# DUGRIZZ

AI dating communication coach. Point it at a conversation and it reads the whole
thing, remembers it, and writes nine replies you could actually send — three tones
at three intensity levels each.

Screenshots are only how conversations get in. Once read, they are stored as text on
a per-relationship timeline, so the model works from an accumulating history rather
than whatever a single screenshot happened to capture.

## Quick start

Only Docker is required. No Node, no pnpm, no Postgres install.

```bash
git clone https://github.com/royeshed22-crypto/dugrizz.git
```

```bash
cd dugrizz
```

```bash
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
docker compose up -d
```

```bash
docker compose logs -f api
```

```bash
docker compose down
```

```bash
docker compose up --build
```

That last one matters: the images bake the source in at build time, so code changes
need `--build` to take effect. `docker compose down` keeps your data; add `-v` to
wipe the database.

## Using it

Onboarding runs once — age gate, consent, then name and goals.

**Scan** has two modes.

*New messages* is the everyday one: drop in a few screenshots of what just happened
and get the read plus replies.

*Import history* is for starting mid-relationship. Upload as much of the chat as you
have, oldest first. Overlapping screenshots are expected and get merged, so you can
scroll-and-capture without trimming the seams. It reports what landed — new of read,
duplicates merged — and then analyses like any other scan, because having just
absorbed the whole conversation is when the read is worth the most.

Either mode takes free text for **anything the screenshots don't show**: what a photo
contained, how a voice note sounded, how long you have been talking. This is weighted
heavily, since it is the one thing the images cannot carry.

The result gives scores for overall, vibe, and interest, a plain-language summary, a
recommended action, and green/red flags. Below that:

- **The conversation** — the transcript as chat bubbles. Tap a message for the read on it.
- **What DUGRIZZ knows** — everything accumulated about this person.
- **Suggested replies** — three cards with a 1/2/3 selector that swaps the message in
  place, from barely-there to full send. **New set** regenerates all nine.

Repeat scans of the same person group under one contact automatically, using the name
from the chat header.

## Stack

- **Web** — Next.js 15 (App Router), Tailwind, Zustand, Framer Motion
- **API** — NestJS 10, Prisma, PostgreSQL, Redis + BullMQ
- **AI** — Google Gemini

pnpm workspaces: `apps/api` and `apps/web`.

```
apps/api/
  prisma/schema.prisma                  database schema
  src/modules/ai/
    gemini.client.ts                    transport: retry, model fallback, quota
    extractor.service.ts                images -> messages
    memory-updater.service.ts           memory + new messages -> what changed
    ai.service.ts                       context -> scores and replies
    memory.types.ts                     the Fact / Inference split
    prompts/                            all prompt text — tune output here
  src/modules/conversation/
    dedup.service.ts                    collapses overlapping screenshots
    conversation.service.ts             the message timeline
    context-builder.service.ts          assembles what the model sees
  src/modules/analyses/
    analyses.processor.ts               the BullMQ worker; the real pipeline
  src/modules/{auth,users,contacts,uploads}/

apps/web/src/
  app/(onboarding)/                     age gate, consent, profile setup
  app/(main)/                           home, scan, contacts, analysis, profile
  components/analysis/
    reply-tone-card.tsx                 the intensity switcher
    conversation-view.tsx               the transcript
    memory-panel.tsx                    what the model knows, editable
  lib/api.ts                            typed API client
```

## How it works

One scan runs this pipeline. Screenshots are read exactly once and never sent again.

1. **extract** — images become structured messages, each tagged with the screenshot
   it came from
2. **resolve** — the contact is identified from the chat header
3. **ingest** — messages merge into the relationship timeline, overlap collapsed
4. **context** — memory plus a recent window is assembled, not the whole history
5. **analyse** — scores, flags, and advice, from text alone
6. **remember** — what changed folds into long-term memory
7. **reply** — nine suggestions, informed by all of the above
8. **persist** — everything in one transaction

### Deduplication

Users screenshot a chat by scrolling, so consecutive images share messages at the
seam. Overlap is collapsed at two levels: within one upload, by grouping on the
screenshot each message came from, and against stored history, by aligning the
timeline's tail with the batch's head.

Matching is exact on normalised text rather than fuzzy. Short chat messages are
routinely 90% similar without being the same message ("כן" / "לא"), and a false seam
silently swallows real ones. Normalisation already absorbs the OCR drift that
fuzziness was meant to cover.

Repeated messages are kept. Duplication only ever comes from screenshot overlap,
which is contiguous, so a later "חחח" is a real message and not a duplicate.

### Facts versus inferences

Memory keeps these apart on purpose. A **fact** is something she said and carries
confidence 1. An **inference** is the model's reading and carries its confidence plus
the evidence behind it, shown in the UI as *likely* / *maybe* / *a guess*.

The prompt refuses verdicts — "she is not interested", "she is playing games" — and
records the observable behaviour instead. Facts a later message contradicts are
dropped rather than kept beside their correction.

### Model fallback

Any single Gemini alias can sit at 503 for minutes, and the free tier's daily quota is
easy to hit. `GeminiClient` walks a list of models: a 503 is retried on the same model
with backoff, while a 429 skips straight to the next one, since retrying an exhausted
quota only burns more of it. The `lite` models carry a separate quota and act as the
last resort.

### Everything completes together

Replies are generated *before* an analysis is marked `COMPLETED`, and messages,
replies, and status are written in one transaction. The client stops polling on
`COMPLETED`, so writing that status early surfaced an analysis with no replies
attached.

## Tuning the output

Reply tone and phrasing live entirely in `apps/api/src/modules/ai/prompts/`.
`analysis.prompt.ts` defines what each intensity level means per tone and carries the
anti-cringe rules: don't laugh at your own joke, don't stack slang, don't manufacture
enthusiasm, and let intensity come from what the message is willing to say rather than
from punctuation. `memory.prompt.ts` governs extraction and the fact/inference split.

Edit, then `docker compose up --build`. No code changes needed.

## Tests

```bash
pnpm --filter=api test
```

41 tests cover deduplication and memory merging — the two places where a quiet bug
corrupts data rather than throwing. They have already caught a similarity threshold
that swallowed whole screenshots and a within-batch overlap case that duplicated a
conversation.

## Troubleshooting

**"Daily Gemini quota is used up"** — the free tier resets at midnight Pacific, around
10:00 Israel time. Until then the app falls back to the `lite` models, which have a
separate quota. Adding billing in Google AI Studio raises the limits substantially.

**An analysis shows no scores** — open it and use *Run the analysis*. The messages are
already saved, so it re-runs from the stored timeline with no new upload.

**Replies didn't generate** — *New set* on the result page retries. If it keeps
failing, check `docker compose logs -f api`; every model in the chain being busy at
once is the usual cause.

**Port already in use** — something else is on 3000, 3001, 5433, or 6379. Change the
left-hand side of the port mappings in `docker-compose.yml`.

**Code changes aren't showing up** — use `docker compose up --build`.

## Local development (without Docker)

Requires Node 20+ and pnpm.

```bash
pnpm install
```

```bash
docker compose up -d postgres redis
```

Create `apps/api/.env`:

```
DATABASE_URL="postgresql://dugrizz:dugrizz_secret@localhost:5433/dugrizz_db"
REDIS_URL="redis://localhost:6379"
JWT_SECRET="dev-secret-keep-this-stable"
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
```

```bash
pnpm dev
```

Postgres is published on host port **5433** so it doesn't clash with a local install.

## Contributing notes

**Ignore patterns must be anchored.** A bare directory name in `.gitignore` or
`.dockerignore` matches at any depth. `uploads/` once matched
`src/modules/uploads/` and pushed a repo that could not build. Write
`/apps/api/uploads/`, never `uploads/`.

To check nothing source-like is being hidden:

```bash
git ls-files --others --ignored --exclude-standard --directory
```

**Keep `JWT_SECRET` stable.** Changing it invalidates every issued token. Clients
recover on their own now, but sessions still reset.

## Notes

- Auth is anonymous: the client generates a device UUID and trades it for a JWT
- Conversation content is never written to logs, only counts
- Uploads are stored on disk with a 24h expiry, in a Docker volume
- Screenshots are sent to Google's Gemini API for processing
- `.env` is gitignored — every machine needs its own key pasted in
