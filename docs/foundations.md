# Adaptive Foundations

Foundations at `/practice/phrases` practices complete sentences using both approved
lesson items and the broader French phrase library. The default round reserves
roughly half its places for each origin when enough eligible expressions exist;
the other origin fills shortages. Suspended sources, future-due reviews, inactive
phrase categories/levels, and alphabet drills are excluded. Recent successful
lesson production gets the existing 24-hour cooldown. Raw/unapproved imports and
Google Docs content are not silently added to practice.

Rounds contain up to twelve independent expressions, bounded by the daily target
(nominal minimum six when the eligible pool permits). Repeated recent Again/Hard
ratings lead, followed by due reviews and new expressions. Legacy wrong counts
still guide selection: an Again reset to zero repetitions is not a new card.
Current practice uses recent rating evidence; all explicit Foundations ratings
remain in the database. The UI shows the source and reason for each question.

## Sentences and feedback

The configured Codex → Claude → OpenAI chain generates each fresh exercise.
Standard questions use practical A2-style sentences of about 6–18 words while
respecting the active tenses. Repeated difficulty reduces each exercise to one
skill; repeated Easy ratings add a detail or clause. Short source words and
expressions must appear in the target itself, so a related grammar example cannot
silently replace the word being learned. Validation rejects isolated words,
previous sentences, leaked full answers and cosmetic rewrites of longer sources.
Semantic quality of longer transformations still depends on the tutor model.

The learner types a French sentence, sees feedback, then always chooses Again,
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
