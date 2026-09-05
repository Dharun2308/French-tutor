# Topics review fixes — 2026-09-05

The owner resumed the paused implementation and requested the Claude review be handled.
Original report: `claude-fable-topics-review-20260905.md`. Findings were checked against the code;
regressions now exercise the ordinary paths that the original integration test omitted.

| Original finding | Resolution |
| --- | --- |
| 1. Early leave causes reteaching | A persistent `needs_theory` flag survives intervening sessions and clears after theory confirmation or a passing assessment. Early leave does not set it. |
| 2. Revisit resets maintenance | Separate `maintenance_due_at` survives error dates. Early voluntary passes preserve the step/date; due passes advance. Failed assessments/repeated errors restart the ladder. |
| 3. Theory overwrites revisit-required | Theory confirmation records understanding and routes to targeted practice without clearing the existing state. Only initial theory advances to controlled practice. |
| 4. Stale zero-weight errors | Pending tags are selected even at zero weight; in-topic tags are forced at most once per batch, leaving other questions broad. Off-topic tags remain contextual evidence. Successful delayed retrieval advances/clears their date. Untested overdue errors remain due intentionally. |
| 5. Last tag overwrites due date | One earliest date is derived across all pending errors and the separate maintenance deadline after each answer. |
| 6. Outage forces penalized reveal | Provider failures save exact ungraded answers and comparison feedback, with no error/accuracy credit or penalty. Up to five replacement questions recover from brief outages. Insufficient graded evidence cannot promote/demote a completed round. |
| 7. Prerequisites block started topics | Prerequisites gate only not-started topics, consistently in UI and server. |
| 8. Drizzle omits new tables | Both schema files are listed in config. Production `db:push` remains prohibited. |
| 9. Positional communication IDs | All 38 existing IDs are explicit title/ID pairs; reordering no longer reassigns progress. No ID migration required. |
| 10. Fresh/restored DB setup | Original missing-handoff claim was stale. Explicit, repeatable `migrate-topics.ts` now applies the original DDL plus the new additive columns/backfill transactionally. No automatic live schema changes. |
| 11. Current daily topic chosen by errors | Current production/revisit work uses `last_studied_at`, updated by the topic’s own session only; other cards still prioritize due/weak retrieval. Guided-only topics remain excluded until ready for production. |
| 12. Mix never advances maintenance | At least two independent correct written answers in a completed mix can advance an established due maintenance topic. Due maintained topics get two old-retrieval slots even with the full imported catalog. Ungraded/assisted answers prevent that credit. |
| 13. Long provider lock | Curriculum CLI deadlines shortened to 25 seconds each; grading to 20 seconds. API requests honor the supplied deadline and disable SDK retries. Targeted theory/questions run concurrently. Failed generation keeps saved feedback for retry. |
| 14. Invalid mixed combinations | Server rejects mixed mode unless topic is mixed, and vice versa. |
| 15. Leave overwrites completed result | Completed guard precedes Leave. |
| 16. Whole-second timestamps | New sessions and attempts explicitly record millisecond timestamps. |
| 17. Feedback inconsistencies | Mixed feedback names the topic; minor-only grades are normalized; hints warn about independent credit before use. |
| 18. Oversized corrections | Focus/Smart save bounded corrections and reasons matching route limits; Focus input matches its answer limit. |
| 19. Optional personal fetch blocks Smart | Failed HTTP/JSON/network personal-queue reads fall back to legacy practice. |
| 20. No Topics entry without imports | Empty-lesson dashboard includes Topics. |
| 21. UI/retry details | Rule-refresh expansion is user-controlled, stale-tab errors have a reload control, Focus clears stale errors and checks session-advance saves, missing sessions return 404. |

Additional coverage checks API timeout against a stalled local HTTP server (exactly one request),
generation retry after failure, concurrent-tab locking, answer-save idempotency, actual delayed
retrieval, oral/reveal evidence, the original 85%/80%/below-70% branches, and weekly phrase rotation.

All mutation checks use disposable `/tmp` databases. Production learner evidence is never simulated.
Real Codex smoke checks pass for theory, questions, minor spelling and conceptual agreement errors.
Phone screenshots are `~/snap/chromium/common/shots/topics-fixes-*.png`.

The follow-up Claude Fable/max report is captured separately as
`claude-fable-topics-fixes-20260905.json`; its final disposition is recorded in HANDOFF.md.

## Follow-up review resolution

Claude Fable/max completed successfully (session `1c22064c-93fb-44f4-b896-3a41d3e71b5c`).
Its report is `claude-fable-topics-fixes-20260905.md`. The following changes were made after that
report and verified by local regression tests; they have not had a third Claude review.

| Follow-up finding | Final change and evidence |
| --- | --- |
| 1–2. Saturated/off-topic forced tags | At most one forced question per pending in-topic tag per batch. Other tags stay contextual. The fixture checks plans and real Codex smoke checks an explicit tag with OTHER as context. |
| 3. Failed maintenance still advances | Targeted/reteach assessments and repeated-error demotions reset step/date. Fail → early exit → theory → guided → production is tested to return to step 0/day one. |
| 4. Mix credit unreachable with real catalog | Due maintenance gets two written retrieval cards. Integration now keeps the full imported catalog eligible. |
| 5. Current topic drifts in mixes | Separate `last_studied_at` excludes mix answers. Repeated mixes retain the intended current topic. |
| 6. One outage wastes a round | Up to five bounded replacements reach the required graded sample. Tested for ordinary rounds and mixed-topic replacement routing; full outages still finish without penalties. |
| 7. Lifetime misses trigger false recurrence | Misses reset when weight/date clear, including legacy cleared rows at the next answer. One later slip schedules normal next-day retrieval without demotion. |
| 8. Reteach flag lost by early retry | `needs_theory` is persisted on progress. Confirm clears it; unrelated early exits cannot. |
| Minor. Past Next review date | The topic detail now says Review due now. |

An additional all-hints regression verifies that failing the independent threshold still makes the
rule due for review even when no conceptual error tag was recorded.

Non-blocking review notes: an explicit theory refresher followed by Start practice still runs an
assessment; the button intentionally opts into practice. Provider latency and verbose-schema failures
can still trigger fallback, but real generation/grading passed within the configured deadlines.
Restoring an old database may conservatively backfill an earlier maintenance date from its old due
field; production had no topic attempts, so no established ladder required reconstruction here.
