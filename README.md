# French Tutor

A personal, adaptive French verb conjugation tutor. SRS-backed drills plus an AI sentence builder that teaches you the same sentence in **formal / neutral / informal** registers.

- **Frontend**: Next.js 15 App Router, Tailwind, shadcn/ui
- **Backend**: Route handlers on the Node runtime
- **DB**: Turso (libSQL) via Drizzle ORM
- **AI**: OpenAI `gpt-5-mini` with strict JSON schema outputs
- **Deploy**: Vercel

## Features

- **Fill-in-the-blank drills** with typo-tolerant grading (accents matter for tense, typos don't).
- **SRS flashcards** using a SuperMemo-2 style algorithm. Rate 0-4 with your keyboard.
- **Multiple choice** with server-picked distractors drawn from other verbs in the same tense/person.
- **AI sentence builder** — the signature feature. Translate a short English prompt to French, then see three register variants (formal, neutral, informal) with a short explanation of what changed.
- **AI grading** that maps natural-language feedback back to an SRS rating (typo = Hard, wrong tense = Again, etc.).
- **Pronunciation** — speaker buttons everywhere (library, practice cards, register variants). Toggle between **browser TTS** (free, instant) and **OpenAI `gpt-4o-mini-tts`** (premium quality, cached per phrase) in Settings.
- **Library** view to browse every verb and its conjugations across tenses.
- **Dashboard** with due counts, retention %, daily progress, weakest verbs.
- Accent helper bar (é è ê à ç ù û î ï ô œ) with Alt-key shortcuts.
- Dark mode.

## Quick start

### 1) Install

```bash
npm install
```

### 2) Set up Turso

If you don't have the Turso CLI yet:

```bash
curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup    # or `turso auth login`
turso db create french-tutor
turso db show french-tutor --url
turso db tokens create french-tutor
```

### 3) Environment

```bash
cp .env.example .env.local
```

Fill in:

- `TURSO_DATABASE_URL` — from `turso db show french-tutor --url`
- `TURSO_AUTH_TOKEN` — from `turso db tokens create french-tutor`
- `OPENAI_API_KEY` — https://platform.openai.com/api-keys
- `SEED_TOKEN` — any long random string (only used for `/api/seed`)

### 4) Push the schema and seed

```bash
npm run db:push   # creates tables in Turso
npm run seed      # populates ~40 verbs + ~1440 conjugations
```

The seed runs sanity checks on ~40 known conjugations before writing anything, so if the conjugator has a regression, the script refuses to touch your DB.

### 5) Run

```bash
npm run dev
```

Open http://localhost:3000.

## Daily loop

1. Open the dashboard — it shows how many cards are due.
2. Pick a practice mode:
   - **Drill** — type the form. Best for building precision.
   - **Flashcards** — recall, reveal, rate. Best when you're tired.
   - **Multiple choice** — fast pacing, good for warming up.
   - **Sentence builder** — the AI generates a sentence, you translate, and you see register variants. Best for actually using the verb in a real thought.
3. Visit **Settings** to add more tenses or levels as you grow.

## Deploy to Vercel

```bash
npm i -g vercel
vercel
```

On first deploy, Vercel will ask to link a project. Then, in the Vercel dashboard:

- **Settings → Environment Variables**: add `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `OPENAI_API_KEY`, `OPENAI_MODEL` (optional, defaults to `gpt-5-mini`), and `SEED_TOKEN`.
- Redeploy (or run `vercel --prod`).

All route handlers use `export const runtime = "nodejs"` — no edge-runtime surprises.

### Seeding production

Easiest: point `.env.local` at your production Turso DB temporarily and run `npm run seed` locally. Alternatively, call the guarded endpoint:

```bash
curl -X POST https://your-app.vercel.app/api/seed \
  -H "x-seed-token: $SEED_TOKEN"
```

## How the SRS works

`src/lib/srs.ts` implements a simplified SM-2 with four rating buckets:

| Rating | Name  | Effect                                              |
| :----: | :---- | :-------------------------------------------------- |
|   0    | Again | Reset, 1-day interval, ease -= 0.2 (floor 1.3)      |
|   1    | Hard  | interval × 1.2, ease -= 0.15                        |
|   2    | Good  | interval × ease                                     |
|   3    | Easy  | interval × ease × 1.3, ease += 0.15                 |

Every practice mode feeds into the same SRS state, so the sentence builder moves the SRS needle just like the flashcards do.

## How register variation works

`POST /api/ai/sentence` takes a `{verbId, tense}` and returns `{prompt_en, formal, neutral, informal, notes}`. The OpenAI call uses **strict JSON schema** mode, the response is **zod-parsed**, and the result is **cached** in `sentence_examples` keyed on `(verbId, tense, promptHash)` so regenerating the same exercise is free.

`POST /api/ai/grade` evaluates a free-text answer and returns a verdict (`correct | minor | major | wrong`). The verdict → SRS rating mapping is in `verdictToRating()` — server-side, not LLM-decided, so the model can't put a thumb on the scale.

## Repo layout

```
src/
  app/
    api/              # route handlers (Node runtime)
    practice/         # drill, flashcards, multiple-choice, sentence
    library/
    settings/
    page.tsx          # dashboard
    layout.tsx
    globals.css
  components/
    ui/               # shadcn primitives
    nav.tsx
    accent-bar.tsx
    practice-shell.tsx
    rate-buttons.tsx
    register-card.tsx
    empty-state.tsx
    theme-provider.tsx
  hooks/
    use-hotkeys.ts
  lib/
    db/               # Drizzle schema + libSQL client
    seed/             # verb data, conjugator engine, sanity checks
    srs.ts            # SM-2
    normalize.ts      # accent-aware comparison + hashing
    openai.ts         # chatJSON helper
    prompts.ts        # system prompts + zod schemas
    rate-limit.ts
    api.ts            # route handler helpers
    utils.ts
  types/
scripts/
  seed.ts             # local seed entry
```

## Keyboard shortcuts

| Mode             | Keys                               |
| :--------------- | :--------------------------------- |
| Drill            | Enter = check/next                 |
| Flashcards       | Space = reveal · 1–4 = rate        |
| Multiple choice  | 1–4 = pick · Enter/Space = next    |
| Sentence builder | Enter = grade / next               |
| Any text input   | Alt + e/a/c/u/i/o → insert accent |

## Adding more verbs

Edit `src/lib/seed/verbs.ts`. For regular verbs you only need a few fields; the conjugator derives the rest. For irregulars, provide `present`, `futurStem`, `pastParticiple`, and optionally `imparfait`. Then run `npm run seed` — it's idempotent and won't touch existing verbs.

If you add a new irregular pattern, also add it to the expectations list in `src/lib/seed/build.ts` so the sanity check covers it.

## Notes & limitations

- Passé composé with être uses **masculine** agreement (singular for je/tu/il, plural for nous/vous/ils). This is a documented choice to keep the seed small; feminine agreement is on the backlog.
- `vous` is treated as plural, not singular formal.
- The SRS state lives on cards, not sessions — closing the app mid-review is safe.
- Vercel free tier is plenty for a single user.
