# Focus session selection and fresh contexts

New Focus sessions exclude items whose latest production/listening rating in the
last 24 hours is Good or Easy (2/3). A later Again or Hard (0/1) makes the item
eligible again. Recognition ratings do not suppress production practice. At an
identical timestamp, the lower rating wins. This is a Focus selection rule, not
a change to the item's FSRS schedule or learning scores.

Selection retains the existing weekly, listening, correction and due buckets,
deduplicates across them, and offers at most twelve eligible cards. It never
backfills with cooling items. Small pools yield shorter sessions; no eligible
items yields an All caught up screen linking to Topics. An empty library still
links to Import. Existing active sessions retain their saved plan for two hours.
Start a fresh session explicitly abandons the old plan and selects again without
fabricating any ratings or undoing completed reviews.

Up to three repeated production targets per new session request fresh contexts,
prioritizing corrections before other weekly/weak targets. New/unreviewed items
and listening retain their saved card face. A context is generated when its card
becomes current. The app's configured provider chain handles generation (normally
Codex/gpt-5.6-sol, with the existing settings/fallback policy). Preparation pauses
the practice timer and hides the old card until its final context is ready.

The generator sees the original target, grammar/correction context and last twenty
saved variations. It must preserve the target phrase or grammatical distinction
in a different A2 sentence. Validation rejects exact/cosmetic duplicate prompts or
answers and, for grammar/corrections, simply adding text around the previous full
sentence. Semantic appropriateness remains model-judged; prompts and validation
cannot guarantee every generated exercise is perfect.

Variations persist in the existing `item_variations` table; the existing
`focus_sessions.plan_json` stores optional freshContext, variationId and
variationUnavailable fields. No SQL migration or db:push is needed. Existing
plans remain readable. A per-card in-flight promise avoids duplicate generation;
an atomic comparison of the original plan/current index/status prevents racing
loads or advancement from replacing a shown card. Concurrent session GETs reuse
one creation in the current app process. A multi-process deployment would need a
DB-level singleton/lease for session creation, beyond this single-process app.

Grading receives variationId and reads that variation's target; review evidence
still belongs to the original learning item. Resuming does not regenerate a saved
context. Failure persists the original card as an explicitly labelled fallback,
so a retry cannot switch its target under an answer. A missing item/variation
retains its plan index and can be skipped without a fabricated review. A race
after generation may leave an unused variation row; it cannot change the active
card or learner scores.

## Verification

- Focus plan tests cover all buckets, short/empty pools, cooldown expiry, later
  misses, recognition exclusion and timestamp ties.
- `scripts/verify-focus-sessions.ts` runs against a disposable database copied
  from production (`TURSO_DATABASE_URL=file:/tmp/...`). It verifies concurrent
  loads, persistent targets, the actual grade endpoint, fallbacks, duplicate
  rejection, generation/advance races, restart and unchanged learner rows.
- A live Codex call with a disposable DB generated a new subject/context for the
  reflexive negative passé composé with y. No live review rows were written.
- TypeScript, the existing test suite and production build passed.
- Deployed phone light/dark checks passed for preparation, the paused timer,
  variation ID grading, original-item review association, labelled fallback,
  completion, caught-up and restart flows. Browser reviews were simulated; no
  live learner ratings were created. Screenshots: `google-docs-focus-*.png` in
  `~/snap/chromium/common/shots/`. The temporary browser was closed afterward.
