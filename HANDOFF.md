# French Tutor — handoff for the next agent (Codex)

_Written 2026-09-02 ~19:00 MDT by Claude Code, mid-build. Read fully before touching anything._

## 0. What this is

A personal French-learning app (Next.js 15 App Router, Drizzle + libSQL/SQLite, Tailwind/shadcn),
self-hosted on this box and used from the owner's phone over Tailscale. The owner (Dharun) is A2,
in Alliance Française A2.2, takes frequent iTalki lessons, targets TCF Canada NCLC 5 → NCLC 7.
Listening is his weakest skill.

Two things were built today on top of the existing app:

1. **Part A** — moved off Vercel/Turso to local (done, verified).
2. **Part B** — "lesson notes → active recall" system. Phase 1 (import) done and verified with real
   handwriting. Provider switch (Codex/Claude/API) done. Phase 2 (FSRS review) built and mostly
   verified — see §6 for exactly what's pending.

The approved design lives at `~/.claude/plans/modular-orbiting-acorn.md`. The full feature spec
(18 features, learning principles, implementation order) came from the owner verbatim and is
summarised in §8. **Phases 3–5 have not been designed — plan them properly before coding.**

## 1. Runtime & workflow (non-negotiable)

| Thing | Value |
|---|---|
| Repo | `/home/multi_mind/French-tutor` (clone of `Dharun2308/French-tutor`, base `be2ad78`). **Nothing committed yet** — all of today's work is uncommitted. Owner hasn't asked for commits. |
| Service | user unit `french-tutor.service` → `next start -p 8095 -H 127.0.0.1`. **Loopback only on purpose** (app has zero auth; LAN has SMB). |
| Phone URL | `https://multimind.tail8a8aef.ts.net:10000` (tailscale serve → 8095). 443 = journal-digitizer, 8443 = jarvis. |
| DB | `file:/home/multi_mind/French-tutor/local.db` (absolute path in `.env.local`). Backup from before Phase 2 migration: `local.db.bak-pre-phase2`. |
| Env | `.env.local` (gitignored): `TURSO_DATABASE_URL`, `OPENAI_API_KEY` (same key as `~/.jarvis/.env`), `OPENAI_MODEL=gpt-5-mini`, `OPENAI_TTS_MODEL`, `OPENAI_VISION_MODEL=gpt-5`. Provider knobs documented in `.env.example`. |
| Node | `/home/multi_mind/.local/bin/node` v22. `codex` and `claude` CLIs at `~/.local/bin/`. |

**Rules**
- `systemctl --user stop french-tutor` before `npm run dev` or any schema change (shared SQLite file).
- Ship a change: `npx tsc --noEmit && npm test && npm run build && systemctl --user restart french-tutor`.
- `npm test` = `node --test` on pure modules only (`tests/*.test.ts`). 19 tests, all green as of writing.
- **Do NOT run `npm run db:push` against `local.db` with data in `learning_items`** — see §4.1.
- Verify UI by rendering, not by grepping CSS. Headless chromium on this box is snap-confined: it can
  only write to a non-hidden `$HOME` path, e.g. `~/snap/chromium/common/shots/x.png`. Use
  `--virtual-time-budget=5000 --window-size=390,844` for phone views.
- The owner steers by stating requirements; don't give him multiple-choice menus. One question at a time.
- Owner's real data: **`import_batches` id 3 (14 items, his real notebook page) — never wipe it.**
  Batches 1–2 were my test data (deleted). Batch 4 was a verification run (discarded).
- The old **Vercel deployment is still live and public** (`french-tutor-two.vercel.app`) with no auth on
  his OpenAI key. Flagged to him; he hasn't decided. Don't touch Vercel/Turso without asking.

## 2. Architecture — what exists

### Pre-existing (don't break)
- `cards` (verb conjugations, SM-2 state) and `phrases` (868 seeded foundation phrases, SM-2 state on the
  row). Scheduler in `src/lib/srs.ts`. **Left untouched by design** — FSRS is only for new items.
- `src/lib/openai.ts` `chatJSON()` — strict JSON-schema completions. I added optional `images?: string[]`
  (data URLs) + `getVisionModel()`. Used by TTS, sentence builder, translate, mnemonic — still on the API key.
- `src/lib/normalize.ts` — `compareAnswerFlexible` (Damerau typo tolerance, accents meaningful),
  `basicClean`, `stripAccents`. Reused heavily.
- `src/components/rate-buttons.tsx` — Again/Hard/Good/Easy = ratings 0..3. `practice-shell.tsx`,
  `accent-bar.tsx`, `speak-button.tsx`, `hooks/use-hotkeys.ts` (hotkeys ignored while focus is in an input).
- `src/lib/seed/ensure-seeded.ts` — the app's own additive-migration mechanism (try/caught `ALTER TABLE ADD COLUMN`).

### Phase 1 — Import Lesson Notes (done)
| File | Role |
|---|---|
| `src/app/import/page.tsx` | Camera / photo library / paste text. Client downscales to 1600px JPEG q0.8. Shows `<ProviderStrip/>`. On 502-with-batchId it still navigates to the review page (which shows Retry). |
| `src/app/import/review/page.tsx` | Approval list (checkbox, type badge, tap-to-set stars, edit-in-place, delete, notebook photos, sticky "Add N"). States: pending / failed (Retry + Discard) / reviewed / discarded. Wrapped in `<Suspense>` because of `useSearchParams`. |
| `src/app/api/import/extract/route.ts` | New batch **or** `{batchId}` retry. Stores photos under `uploads/<batch>/`, runs the provider chain, annotates duplicates, stores result on `import_batches.extracted_json`. On total failure: keeps batch, sets `extract_error` + `provider_log`, returns 502 `{batchId, attempts, retryable:true}`. **Writes nothing to `learning_items`.** |
| `src/app/api/import/commit/route.ts` | **Only writer of `learning_items`.** Merges on `norm_key` (encounter_count++, importance += priority, priority = max, appends example to `extra_examples`, correction outranks type). Sets `due_at = now`. |
| `src/app/api/import/batches/route.ts` | GET list / GET `?id=` (includes `providerLog`, `extractError`, `model`) / PATCH discard or label. |
| `src/app/api/import/image/route.ts` | Serves `?batch=&n=` from disk; file name resolved server-side. |
| `src/lib/import/extract-prompt.ts` | Zod + JSON schema + system prompt encoding the owner's 10 extraction rules and profile. Lenient wire schema (priority/confidence clamped). |
| `src/lib/import/norm-key.ts` | `normKey` (accents kept, punctuation/case/annotations dropped), `looseKey` (accent-insensitive, warn only), `splitVariants`. |
| `src/lib/import/dedupe.ts` | Checks `learning_items` **and** seeded `phrases`. |
| `src/lib/import/storage.ts` | `uploads/` dir helpers. |

### Provider layer (done)
`src/lib/ai/providers.ts` — `runStructured(req, zodSchema, enabled)` tries **codex → claude → openai**
in fixed order, logs every attempt to `provider_events`, throws `AllProvidersFailed` with all attempts.
`src/lib/ai/cli-args.ts` — pure arg builders (tested). `src/app/api/ai/providers/route.ts` — GET status,
POST `{provider}` = Test button. `src/components/provider-status.tsx` — `<ProviderSettings/>` (Settings
page, toggles save immediately via `PUT /api/settings {extractProviders:{id:bool}}`) and `<ProviderStrip/>`
(Import page). Enabled set lives in `settings.extract_providers` JSON; default
`{"codex":true,"claude":true,"openai":false}` — **owner said keep API off.**

- Codex: `codex exec -i … -m gpt-5.6-sol -c model_reasoning_effort=medium --output-schema f -o out -s read-only --skip-git-repo-check -C tmpdir "<prompt>"`, `OPENAI_API_KEY` stripped from env → ChatGPT-account auth. Owner chose sol/medium on 2026-09-03; this model had previously been rejected by the local ChatGPT-account CLI, so verify it and expect automatic Claude fallback if unsupported.
- Claude: `claude -p --allowedTools Read --output-format json --json-schema '<json>' --model opus --effort high --max-turns N --no-session-persistence "<prompt>"`, `ANTHROPIC_API_KEY`/`CLAUDECODE`/`CLAUDE_CODE_ENTRYPOINT` stripped. Result in `structured_output`. Owner chose opus/high on 2026-09-03.
- OpenAI: existing `chatJSON` with images as data URLs. Off by default.

### Phase 2 — FSRS review (built; see §6 for verification status)
| File | Role |
|---|---|
| `src/lib/fsrs.ts` | `ts-fsrs@5.4.2` wrapper: `applyItemRating(itemSrs, rating0..3, now)`, `retrievability`, state labels. Fuzz + short-term learning steps on. |
| `src/lib/items/card.ts` | `cardFor(item)` — production-first face: if the item has a tutor example, prompt = `exampleEn`, target = `exampleFr`; else `english` → `french`. Server-side so queue and grader agree. |
| `src/lib/items/grade-prompt.ts` | Verdicts CORRECT / ACCEPTABLE / MINOR_ERROR / WRONG + error_type + corrected + reason. |
| `src/app/api/items/next/route.ts` | Due queue (`due_at <= now`, not suspended), overdue first then priority. |
| `src/app/api/items/review/route.ts` | Applies FSRS, updates counters (review/success/failure, per-direction seen/correct), inserts `item_reviews`. |
| `src/app/api/ai/grade-item/route.ts` | Stage 1 local: `exact` → CORRECT, `accent-typo` → MINOR_ERROR. **Everything else (incl. 1–2 letter slips) → AI**, because `manger`/`mangé` is a grammar error not a typo (owner's own example). If all providers fail: typo → ACCEPTABLE-with-caveat, else UNGRADED — never blocks the session. |
| `src/app/practice/items/page.tsx` | EN prompt → type FR → Check → verdict + corrected + reason + key phrase + speak → RateButtons (Enter = suggested, 1–4 override) → next. "I don't know" reveals with Again suggested. |
| Dashboard | "Import lesson notes" card (badges: N failed / N to review) and "Review lesson items" card (N due). `/api/stats` gained `learningItemsTotal/ThisWeek/Due`, `importsPending/Failed`. |

### Schema (all in `src/lib/db/schema.ts`)
`import_batches`, `learning_items` (content + dedupe + FSRS + metrics + per-direction counters +
`suspended`), `item_reviews` (append-only log with FSRS snapshot), `provider_events`,
`settings.extract_providers`. Design call (owner can override): **one FSRS schedule per item, three
mastery counters** (production/recognition/listening) — not three schedules.

## 3. Verified today (real calls, real rendering)
- Part A end to end incl. phone screenshots and a live OpenAI sentence-builder call.
- Phase 1: text-path and image-path extraction (both found strikethrough corrections), dedupe vs seeded
  phrases, merge on re-import, 409 guards, image route (200/404/400), phone screenshots of import + review.
- Owner imported a real notebook page himself (batch 3) and said "it works".
- Provider Test button: Codex `gpt-5.6-terra` ok in 4.5 s. Claude failed *only* because of the
  arg-order bug in §4.2, which is now fixed (tests added) — **re-test after rebuild is still pending, see §6.**
- Grading (temp item, deleted after): exact → CORRECT local; wrong → WRONG via Codex in 6.5 s with a
  correct reason. FSRS: Good → Learning/+10 min; Again → relearn; counters and `item_reviews` rows correct.
- Failure UI: review page renders "Extraction failed" with per-provider errors, Retry, Discard, and the
  photo — screenshot confirmed. Dashboard, items page, import strip render correctly on phone.

## 4. Gotchas that cost time — don't rediscover them

### 4.1 drizzle-kit push will DESTROY `learning_items`
`drizzle-kit push` mis-reads `.default(0)` / `.default(false)` as "no default" and offers to *truncate
the table* to add the columns. I applied the Phase 2 DDL by hand instead:
`scripts/migrate-2026-09-02-phase2.sql` (additive `ALTER TABLE ADD COLUMN … DEFAULT 0`, new tables
copied from `drizzle-kit generate`). After that, push reported no destructive changes. **For future
schema changes: write additive SQL the same way, or use `sql\`0\`` as the default (which push accepts —
`due_at` uses it).** `drizzle/` is gitignored. Keep `local.db.bak-*` backups before migrating.

### 4.2 CLI variadic flags eat the prompt
`codex exec -i <FILE>...` and `claude --allowedTools <tools...>` are variadic. If the prompt follows them
directly it is consumed as a file/tool name and the CLI says "No prompt provided". The prompt must be
the last arg with a non-variadic flag in between. Enforced by `tests/cli-args.test.ts`.

### 4.3 Codex specifics
- Spawn with **stdin closed** (`stdio: ["ignore", …]`) or `codex exec` blocks forever on "Reading additional input from stdin…".
- Under a ChatGPT login only these models work: `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`, `gpt-5.4-mini`.
  `gpt-5`, `gpt-5-codex`, `gpt-5.4`, and the owner's `config.toml` model `gpt-5.6-sol` are rejected
  ("not supported when using Codex with a ChatGPT account"). The app passes `-m` explicitly, so it does
  not depend on `config.toml` — but the owner's own `codex-*` skills may be broken by that config. Flagged, not fixed.
- Transient 401 "token expired" lines appear in stderr during refresh; the real reason is the **last
  `ERROR:` line**. Once I saw "You've hit your usage limit … try again at Sep 7" and it went away minutes later.
- Sandbox `read-only` + `-C <tmpdir>` so it never scans the repo; `-o` is written by the CLI itself, not the model.

### 4.4 Claude CLI specifics
`--json-schema '<inline json>'` → `structured_output` in the `--output-format json` envelope.
Read tool renders images to the model; pass absolute paths and set cwd to the images' dir.
`--effort low|medium|high` exists. Strip `ANTHROPIC_API_KEY` or it bills the API (this box has a history
of exactly that with Hermes cron).

### 4.5 Misc
- Next 15: any client page using `useSearchParams` must be inside `<Suspense>` or the build fails.
- SQLite FK cascades are **not enforced** (no `PRAGMA foreign_keys=ON` in the libsql client). Deleting a
  `learning_items` row directly leaves orphan `item_reviews`; the app never deletes items yet. If you add
  delete/suspend, delete children explicitly or enable the pragma.
- `ensureSeeded()` auto-merges all phrase categories into settings only when *it* inserts phrases; a plain
  `npm run seed` leaves 5 of 30 categories active. Prod settings were replayed via `PUT /api/settings`.
- Extraction takes ~5–15 s on Codex/Claude vs 45–60 s on the OpenAI API path.

## 5. Test data hygiene
`learning_items` currently = the owner's 14 real items (batch 3). If you need to exercise grading/review,
insert a temp row with a unique `norm_key`, use it, then delete it **and** its `item_reviews` rows.

## 6. Continuation status (Codex, 2026-09-02 ~19:45 MDT)

The Phase 2 verification work below is complete unless explicitly noted:

1. **Provider checks:** Codex photo extraction succeeded with `codex:gpt-5.6-terra` and one successful
   provider attempt (verification batch 8, 12 extracted items, then discarded). Claude's corrected CLI
   invocation reached the service, but the subscription returned `You've hit your session limit · resets
   10pm (America/Denver)`, so a successful Claude response still needs a re-test after that reset. The app
   now extracts this useful message from Claude's JSON error envelope instead of displaying raw JSON.
2. **Grading:** `Je n'ai pas encore manger.` against `Je n'ai pas encore mangé.` returned `MINOR_ERROR`,
   `errorType: conjugation`, via Codex. The temporary item and any review rows were deleted afterward;
   `learning_items` remains the owner's 14 rows.
3. **Failure/retry e2e:** all providers disabled → 502 with retained batch 9 → phone render showed Retry
   and Discard → original provider settings restored → Retry succeeded via Codex → batch discarded.
   Final settings are `{"codex":true,"claude":true,"openai":false}`.
4. **Phone rendering:** Settings was rendered at 390×4200 and the failed-import page at 390×844.
   Long provider errors now use defensive wrapping; the deployed Settings page no longer overflows.
5. **Shipping gate:** `npx tsc --noEmit`, `npm test`, and `npm run build` passed; `french-tutor.service`
   was restarted and confirmed active.

Still optional: update `~/.claude/projects/-home-multi-mind/memory/french-tutor-local.md` if Claude's
separate memory should mirror this handoff. Phase 3 was subsequently designed and shipped; see §9.

## 7. Roadmap (owner-approved order; design each before building)
- **Phase 3 — shipped 2026-09-02**: weak-items engine ("Weak French": low retrievability + failures + recent corrections +
  usefulness − spontaneous usage), **Active 10** weekly selection with pin/unpin, **Tutor Mode** page
  (instruction text for the iTalki tutor; post-lesson "used naturally / with help / didn't" →
  `spontaneous_usage_count`, weighted above a flashcard pass), **recurring-error log** (`error_patterns`
  table from `item_reviews.verdict/error_type`).
- **Phase 4 — shipped 2026-09-02**: listening mode (1x/0.85x/0.7x replay, transcript hidden until attempt,
  `listening_*` evidence), disk-cached OpenAI TTS with free browser fallback, cached A2 variations for
  repeatedly missed items, and AI conversation practice that secretly targets weak items.
- **Phase 5 — shipped 2026-09-02**: evidence-only analytics, adaptive 12-card/10-minute sessions using the
  40/25/20/15 mix, weekly review with on-demand cached AI summary, and a deliberately non-scoring TCF/NCLC
  readiness evidence panel.
- Schema was shaped so these are additive: `item_reviews`, `spontaneous_usage_count`, per-direction counters,
  `grammar_topic`, `suspended` already exist.

## 8. Owner's constraints (verbatim intent)
Active recall > rereading · production > recognition · spaced repetition > cramming · personal errors >
generic lists · phrases in context > isolated words · listening to known language > native firehose ·
spontaneous usage > memorised answers · human tutor > AI-only · consistency > marathons.
UX rule: after a lesson → photograph → ~8 proposals → approve in 60 s → done. No manual deck/tag/date
upkeep. Never auto-insert AI output. Don't make every A2 lesson TCF prep yet. No gamification clutter.

## 9. Phase 3 production state (Codex, 2026-09-02)

- Design: `docs/phase-3-design.md`.
- Added deterministic Weak French ranking, weekly Active 10 with pin/unpin/replace, Tutor Mode with
  idempotent natural/helped/not-used feedback, and recurring-error evidence/aggregation.
- Added `item_reviews.error_type/corrected_answer/grade_reason`, `active_selections`,
  `tutor_usage_events`, and `error_patterns` with the additive migration
  `scripts/migrate-2026-09-02-phase3.sql`.
- Production backup before migration: `local.db.bak-pre-phase3`. Migration integrity check passed;
  batch 3 and all 14 owner items were preserved.
- The first real Active 10 was generated for the week of 2026-08-31. No fake tutor usage or review
  outcomes were written to production.
- Dashboard was simplified into a compact, conversation-first layout. Phone and desktop renders passed.
- Verification: TypeScript, 31 unit tests, production build, disposable-DB integration test, API probes,
  and phone/desktop screenshots all passed. `french-tutor.service` was active afterward.

## 10. Phases 4–5 production state (Codex, 2026-09-02)

- Designs: `docs/phase-4-design.md` and `docs/phase-5-design.md`.
- Additive migrations: `scripts/migrate-2026-09-02-phase4.sql` and
  `scripts/migrate-2026-09-02-phase5.sql`; backup is `local.db.bak-pre-phase4`.
- New pages: `/practice/listening`, `/practice/variations`, `/conversation`, `/practice/focus`,
  `/progress`, and `/weekly`.
- AI speech is still opt-in via Settings. OpenAI MP3s persist under ignored `tts-cache/`; slower playback
  reuses the same recording. No TTS/API call occurs until the learner taps Listen with OpenAI speech enabled.
- Fresh contexts unlock after two misses. Conversation targets stay hidden until Finish, and AI practice
  use is intentionally not counted as real tutor/spontaneous evidence.
- Weekly summaries run only when requested and are cached by local week plus the exact facts hash.
- Disposable-DB route probes and phone renders passed without paid AI/TTS calls. Production remained at
  14 batch-3 items and zero fabricated review/usage evidence after verification.
