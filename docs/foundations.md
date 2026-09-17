# Beginner Foundations

Foundations at `/practice/phrases` practices A1 and A2 words and short phrases using
both approved lesson items and the broader French phrase library. B1 and above are
excluded even when they have many misses. Lesson sources use the basic expression,
not their longer example sentence. Sources are limited to eight French words.
The default round reserves
roughly half its places for each origin when enough eligible expressions exist;
the other origin fills shortages. Suspended sources, future-due reviews, inactive
phrase categories, and alphabet drills are excluded. Foundations has its own
A1–A2 range, independent of the level filters for verb practice. Recent successful
lesson production gets the existing 24-hour cooldown. Raw/unapproved imports and
Google Docs content are not silently added to practice.

Rounds contain up to twelve independent expressions, bounded by the daily target
(nominal minimum six when the eligible pool permits). Repeated recent Again/Hard
ratings lead, followed by due reviews and new expressions. Legacy wrong counts
still guide selection: an Again reset to zero repetitions is not a new card.
Current practice uses recent rating evidence; all explicit Foundations ratings
remain in the database. The UI shows the source and reason for each question.

## Phrases and feedback

The configured Codex → Claude → OpenAI chain generates each fresh exercise.
Questions stay at A1–A2 with familiar everyday language. New contexts use the
present; a short source expression can retain an already-taught construction. Supported
questions are usually 1–4 words, standard 2–6, and even stretch stays at 3–8 words
with at most one familiar detail. The validator caps targets at eight words and
requires a short `Translate:` prompt (at most twenty words). No elaborate stories,
extra clauses, advanced tenses or new rules are requested for novelty. Single
words, short greetings and small variations are allowed. Short source words and
expressions must appear in the target itself, so a related grammar example cannot
silently replace the word being learned. Validation rejects repeated prompt/answer
pairs and leaked full answers. Vocabulary choice still depends on the tutor model.

The learner types French, sees feedback, then always chooses Again,
Hard, Good or Easy (keys 1–4). Exact answers use local comparison; other answers
use the existing meaning/grammar grader, which accepts valid alternatives and
distinguishes writing slips from real grammar errors. Reveal supports self-review.
Checking or revealing alone does not change the schedule. Skip adds no review.

Failed generation produces a labelled original-expression fallback, stable across
reloads. Failed grading produces UNGRADED feedback followed by the same explicit
self-rating controls. Providers and their reasoning settings are unchanged:
Codex remains `gpt-5.6-sol` at medium effort.

## Rating memory

Each independent review stores its exact prompt, target, answer, feedback and
chosen rating. Again/Hard expressions return with that same sentence in their
next eligible round. Good/Easy success allows fresh contexts at the next due date.
Intervening practice in another mode can supersede a stale saved retry.

Up to three difficult sentences also return after two other questions where the
remaining round allows. These extra attempts are stored with `independent=false`:
they do not change source schedules, recall counters or independent accuracy a
second time. Their success cannot erase the original independent lapse.

Personal lesson items keep the shared FSRS review transaction and error evidence.
Everyday phrases retain their existing SM-2 state, with Foundations recovery steps:

| Rating | Everyday expression scheduling |
| --- | --- |
| Again | Ten minutes; repetitions reset. |
| Hard | Thirty minutes for new/repeatedly difficult expressions; otherwise at most one day. Does not increase repetitions. |
| Good | Normal SM-2 spacing; capped at one day after repeated recent struggles. |
| Easy | Normal Easy spacing, at least four days. |

No historical ratings, schedules or learner counters are rewritten on installation.
The old `/api/phrases/*` endpoints remain available to existing callers, but the
Foundations screen now uses `/api/foundations-session`.

## Installation and persistence

Back up the database, then apply `scripts/migrate-2026-09-15-foundations.sql` before
activating the new build. It only adds `foundations_sessions`, `foundations_reviews`
and their indexes. It is repeatable and is included in the new-database Drizzle
configuration. Do not run `db:push` against production.

The September 16 difficulty correction needs no schema migration. New sessions
have data version 2. Reloading an active version 1 round requests a new beginner
round and retires the old round; all its ratings remain saved. Version 1 exercises
are excluded from cached retries and generation history so old advanced text cannot
return through a retry. Their ratings still contribute to recall memory.

Sessions persist selection, prompts, feedback, follow-ups and position. Drafts
use localStorage per question. AI work is serialized within a process; database
revisions reject stale workers. Rating evidence, FSRS/SM-2 changes and advancement
commit in one transaction. Session/question identities make replayed answers and
ratings safe even after the server saved but the client lost the response.
Changed, deleted or suspended sources cannot receive stale ratings.

Build in a separate directory while production runs. Stage the tested `.next` on
the production filesystem before atomic activation. Keep the previous runtime and
an online SQLite backup; never replace live data with test fixtures.

## Verification, September 15, 2026

- All 76 unit tests, ESLint, TypeScript and the isolated production build passed.
- `scripts/verify-foundations-session.ts` on a disposable migrated DB covers the
  actual rating transactions, four-rating history, both source schedules, delayed
  exact-sentence retries, independent follow-ups, refresh/replay/concurrency,
  fallback and source-edit/revision rollback. Existing Smart regression also passed.
- Browser fixture: `scripts/prepare-foundations-browser.ts`, then a separate app
  on :8097 and Chromium on :9236, then `scripts/verify-foundations-browser.mjs`.
  Tests include drafts/feedback after reload, failed answers, a response lost after
  rating commit, repeated keys, fallback, every rating, completion and layouts.
- Real Codex at medium generated a sentence retaining `de l’eau`, accepted a
  valid word-order alternative and rejected `de eau`. An earlier sample substituted
  `de l’huile`; it prompted the source-expression validation now in place.
- Claude live verification could not complete: its CLI reported the subscription
  session limit. The configured fallback chain remains available; a future live
  check can run `scripts/verify-foundations-ai.ts` against a disposable DB after
  quota resets. The script disables paid API fallback in that test DB.

All synthetic answers and provider experiments used `/tmp` database copies.
Google Docs, cron jobs and the owner's active Smart session were not modified.

Deployed September 15 at 19:35 MDT. All 23 previous tables matched their saved
content fingerprints through migration and activation, including the active
Smart round. Both new tables were empty after health checks. Six live read-only
routes and SQLite integrity/foreign-key checks passed. Runtime/database backup:
`~/.cache/french-tutor-foundations-20260915/before/`.

## Beginner correction, September 16, 2026

The reported shoe-return exercise came from an imported B1 word (`renvoyer`).
Version 1 selected advanced notes by weakness and requested A2-style sentences.
Version 2 enforces the beginner source and generation limits described above.

All 77 unit tests, lint, TypeScript, the production build, and Foundations
transaction/upgrade integration passed. Real Codex and Claude checks produced
`De l’eau.` and `Je bois de l’eau.` and passed alternative-answer/error grading.
The actual saved round was upgraded in a disposable browser/database: all reviews,
source schedules and the Smart session matched the snapshot afterward, and the
new round contained six A1 note expressions and six A1 everyday expressions.
The regular phone/desktop light/dark browser checks also passed for all four
ratings, reload, failed saves, lost responses after commit, follow-ups and completion.

To repeat the upgrade browser check, use a disposable copy containing an old
version 1 round, disable its AI providers, start its app on :8097 and Chromium on
:9236, and run `FOUNDATIONS_UPGRADE_ONLY=1 node scripts/verify-foundations-browser.mjs`.
The normal fixture and browser scripts test current version 2 rounds separately.

Deployed at 20:18 MDT. All 25 table contents matched the pre-activation backup;
no production practice reviews or data migrations were performed. Six live health
checks and SQLite integrity/foreign-key checks passed. The old round changes only
when the learner returns and the client requests its beginner replacement.
Backup/runtime: `~/.cache/french-tutor-foundations-easy-20260916/before/`.

The owner subsequently allowed both A1 and A2. The 20:26 MDT update broadens source
selection and the generator to that range while retaining the eight-word limit,
brief prompts, core note expressions and B1+ exclusion. Existing version 2 rounds
remain valid. All 77 tests, lint, TypeScript/build, actual A2 rating transactions
for both source types and real Codex A2 generation passed. All 25 production tables
matched the backup after six read-only health checks; no migration was required.
Backup/runtime: `~/.cache/french-tutor-foundations-a1-a2-20260916/before/`.
