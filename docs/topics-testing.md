# Topics — quick testing guide

1. Refresh the dashboard. “Topics” replaces “View Active 10”; the “Woven into...” sentence is gone.
2. Open Topics. Search articles/pronouns; change the family filter. Direct object pronouns should be
   recommended as new; articles after negation should be worth revisiting. Imported topics have
   coverage labels but no invented scores.
3. Open Direct object pronouns → Learn this topic. Expect short English theory, 2–4 examples and
   an optional explanation in your own words. Start practice: one question at a time, no answer shown.
4. Submit an answer. Your exact text and corrected French remain visible, with a brief English
   explanation. A mistake leads to a similar fresh question. Hint gives a small clue; Reveal shows
   the answer without counting an independent success.
5. Refresh during a question or after grading. The same question/feedback should resume. End session
   saves completed attempts. No need to finish in one sitting.
6. Finish guided practice, then production. Twenty independent questions determine readiness:
   17+ correct qualifies for maintenance;14–16 targets weak subrules;13 or fewer refreshes theory.
   Minor writing slips can count as conceptually correct. Follow-ups do not inflate that score.
7. Open a previously practiced topic such as present tense. Continue practice starts production.
   “Explain the rule” gives a refresher; “Check what I remember” starts a fresh production check.
8. Try Daily mix. Expect covered topics, not unstudied advanced grammar. Speaking prompts become
   available after written readiness. Speak aloud then type what you said; no microphone is recorded.
9. Reopen Topics later: accuracy, recurring errors and scheduled reviews should persist. Provider
   labels identify the lesson generator and grader. Settings shows Codex→Claude→API fallback.

Existing Focus and Smart sessions still work; new sessions include weekly lesson phrases automatically.

## Review regression checks

Use a new, disposable `/tmp` SQLite path for each deterministic run:

```sh
TURSO_DATABASE_URL=file:/tmp/topics-original-check.db node --import tsx scripts/verify-topics.ts
TURSO_DATABASE_URL=file:/tmp/topics-review-check.db node --import tsx scripts/verify-topics-review.ts
```

Both scripts apply the Topics migrations themselves. The review script covers early leave, preserved
maintenance, theory during revisit-required, multi-tag dates, zero-weight delayed retrieval, ungraded
denominators, prerequisite changes, invalid mixed requests, oral/reveal, daily maintenance and two tabs. Follow-up checks include realistic-catalog mix credit, study-topic stability,
failed-maintenance rebuilding, bounded outage replacements, tag saturation/scope and cleared miss counts.
Use `scripts/verify-weekly-practice.ts` against a disposable SQLite backup of the full app DB.

For phone regressions, migrate a separate full DB copy, then run `scripts/prepare-topics-browser.ts`
against that copy. This creates explicitly synthetic sessions and disables all AI providers only in
the copy. Start the built app on loopback :8097 with that database and a disposable Chromium on
:9236, then run `node scripts/verify-topics-browser-review.mjs`. It covers real local grading,
outage/continue, saved feedback, hint/reveal, refresh expansion, mixed topic labels, stale-tab reload,
empty-dashboard navigation and a failed optional Smart queue. Screenshots use `topics-fixes-*`.

`scripts/verify-topic-timeouts.ts` uses a local stalled HTTP server and a disposable full DB. It never
calls a real provider. `scripts/smoke-topics.ts` deliberately calls real providers, logging only to
the specified disposable DB; load credentials from `.env.local` without overriding the DB URL.

## Fresh or restored Topics database

Stop the app and make a SQLite backup before changing its schema. Use an explicit local URL:

```sh
TURSO_DATABASE_URL=file:/absolute/path/to/database.db node --import tsx scripts/migrate-topics.ts
```

This additive runner creates missing Topics tables/indexes, then transactionally adds and backfills
`maintenance_due_at`, `needs_theory`, and `last_studied_at` if missing. It is safe to repeat and works on a fresh Topics database or an older
app backup. Other app migrations/seeding remain separate. Never use `db:push` on production data.
