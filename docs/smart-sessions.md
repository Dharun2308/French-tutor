# Smart sessions

The dashboard's Practice now grid has three rows: 10-minute focus / Smart session,
Topics / Listening, AI conversation / Fresh contexts. The weekly banner and its
duplicate buttons are removed. More practice contains Sentence builder,
Foundations and Verb cards, with Learning picture and Weekly review below.

Smart sessions select up to 16 due cards (bounded by the daily-target setting,
with a nominal minimum of six when enough cards qualify). Selection reserves
personal lesson recall, Foundations and verbs; weak personal items use existing
review/conversation evidence. Recent successful lesson reviews get a 24-hour
cooldown, and any one verb supplies at most two cards. Existing verb tense/level
and Foundations category/level filters apply; suspended items are excluded.
Lesson items remain available at their imported CEFR level. Empty pools produce
a caught-up screen, without inventing reviews or forcing future-due cards.

Each question uses the enabled Codex → Claude → OpenAI chain to create a fresh
sentence at the source's level. The generator receives the source skill, recent
mistakes and earlier exercises. Verb exercises require the supplied form, tense
and person. Answer/rubric data stays server-side until feedback. Valid alternatives
are accepted by the AI grader; exact answers use local comparison that preserves
accents and grammatical endings. Wrong grammar receives Again (0); correct or
minor writing-only responses receive Good (2). Corrected French and brief English
feedback are saved with the learner's response.

An independent miss inserts one follow-up after two other questions where space
allows, capped at three extra questions per round. Follow-ups use new contexts
when AI is available and never add independent review counts or advance SRS.
First attempts keep the existing SM-2 schedules for verb/Foundation cards and
FSRS/evidence updates for personal lesson items. Personal review logic is shared
with `/api/items/review`, inside the session's transaction.

Generation failure produces a labelled, stable original-card fallback. If a
non-exact answer cannot be graded, it remains UNGRADED, with no scheduling change
until the learner explicitly self-rates (buttons or keys 1–4). Skipping does not
create a review. The model answer is then a comparison aid, not an automated verdict.
AI availability and response time still depend on the configured providers.

## Persistence and installation

Apply `scripts/migrate-2026-09-09-smart.sql` after backing up the database, before
starting this app version. It only adds `smart_sessions` and a partial unique
index allowing one active session; it is safe to run twice. The schema is also
included in `drizzle.config.ts` for new databases. Do not use `db:push` on production.

Sessions retain the selected sources, prompts, feedback, skips, follow-ups and
current position. Draft answers are stored in localStorage per session/question.
Request locks deduplicate AI work within a process. Database revisions prevent
stale workers from overwriting a session; grading and scheduling commit atomically.
Repeated submits/advances are no-ops. Returning to the page resumes the saved round;
New round on completion rebuilds the selection from current evidence.

## Validation

- `npm test`: selection balance, follow-up spacing/caps, hidden-answer generation
  constraints, plus the existing application tests.
- `scripts/verify-smart-session.ts`: use a migrated disposable `/tmp` DB copy.
  Tests actual scheduling for all source types, cooldown/suspension, concurrent
  start/generation/grade/advance, fallback stability, manual rating, resume,
  independent counts and atomic rollback after a cross-worker conflict.
- `scripts/verify-phase3.ts`: existing review/evidence regression checks, using
  another disposable DB and `UPLOADS_DIR` under `/tmp`.
- `scripts/smoke-smart-ai.ts`: real Codex and Claude CLI generation/grading on a
  disposable DB; verifies wrong-person detection and valid alternative French.
  It disables the API fallback in that test DB.
- `scripts/verify-smart-browser.mjs`: phone/desktop light/dark dashboard rows,
  draft/feedback reload, failed-save recovery, manual fallback, follow-ups and
  completion, against a separate app on :8097 and Chromium on :9236.

Production deployment must build in a separate copy, retain the previous `.next`
for rollback, and compare all existing tables before/after the additive migration.
Copy the tested build onto the production filesystem before attempting an atomic
rename; this installation's `/tmp` is on a different mount.
Test attempts must never be submitted to the live learner database.

Deployed on September 9, 2026 at 18:08 MDT. All 22 pre-existing tables matched
the original backup after activation, and live dashboard/API checks passed.
Runtime and database backup: `~/.cache/french-tutor-smart-20260909/before/`.
