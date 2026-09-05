# Claude Fable follow-up review — 2026-09-05

Review complete. Nothing was edited or run; everything below comes from reading the current worktree, including the files that changed while I was reading.

The 21 original findings are addressed as the resolution doc claims, with two exceptions that are only partially fixed for the real catalog. The remaining problems cluster around one mechanism the fixes introduced, forced pending error tags, plus a maintenance-ladder gap that the original review missed.

## Remaining findings

1. **Medium. Pending tags are forced onto every generated question.** `src/lib/curriculum/service.ts:89-94` assigns a pending tag to every plan entry whenever the topic has at least one pending row, and `src/lib/curriculum/ai.ts:30` rejects any other tag. Trigger: one PRONOUN_PLACEMENT miss early in a direct-objects production round. The row stays pending all day because `successfulErrorReview` keeps a future date, so every later batch from `service.ts:328` is forced to that tag. Fifteen of the twenty production questions then test one subrule, PRONOUN_SELECTION is never tested, and the 85 percent pass stops measuring the topic. Daily-mix cards labelled unpredictable get the same treatment. Fix: force each pending tag at most once per batch, for example `offset < tags.length ? tags[offset] : undefined`, and leave the rest untagged while still passing them as focus tags.

2. **Medium. Off-topic error tags become hard generation constraints.** `service.ts:163-175` stores whatever tag the grader returns, `service.ts:89-94` then forces it, and a mismatch fails the whole provider attempt at `src/lib/ai/providers.ts:112-117`. Trigger: the grader returns VERB_FORM or OTHER for a direct-objects sentence, which the grade prompt allows. The next batch demands direct-object questions whose main tag is VERB_FORM. A generator that follows its own instructions returns a pronoun tag, the schema rejects it, and the request falls through Codex, Claude and the billed API. Continue can return 502 until the tag clears. Fix: only force tags contained in the topic's own tag list. Keep off-topic rows as evidence and pass them via focus tags only.

3. **Medium. The maintenance ladder never regresses, so failing a check and rebuilding advances it.** `service.ts:224-229` treats any existing maintenance date as continuity, and `service.ts:245` writes the step and date back unchanged after targeted and reteach outcomes. Trigger: a MAINTENANCE topic at step 3 is due. Continue gives ten mixed questions, six correct, so the state drops to CONTROLLED_PRACTICE with the stale date intact. Theory, a controlled pass, then a production pass at 17 of 20 sees a past maintenance date and moves the step to 4, thirty days out. The learner who failed lands on the same interval as one who passed. The 70 to 84 percent path and the 3-miss REVISIT_REQUIRED path at `service.ts:176-180` behave the same way, and both strip prerequisite readiness until a fresh 17 of 20 is earned. Fix: in the targeted and reteach branches and at the 3-miss transition, reset the step to 0 and set the maintenance date to one day or null. Consider letting a targeted pass on a topic that holds a maintenance date return to MAINTENANCE at step 0 instead of PRODUCTION_PRACTICE. Add a regression that fails a due check, rebuilds, and asserts the step did not grow.

4. **Low, finding 12 partial. Daily-mix maintenance credit is unreachable with the real catalog.** `src/lib/curriculum/progression.ts:52-64` gives each old topic one written card and sends the two oral cards to maintained topics; `service.ts:202` requires two written answers. Twenty-one imported topics start in PRODUCTION_PRACTICE and are mixable, so the pool always has more than four members and no maintained topic ever gets two written cards. Ranking by error weight before due date also pushes an error-free due topic out of the four old slots. The regression at `scripts/verify-topics-review.ts:130` passes only because it sets every other topic to NOT_STARTED. Fix: rank due maintained topics first, give the first pool topic two of the four old written slots, and test with at least five eligible topics.

5. **Low, finding 11 partial. The mix's current topic drifts to whichever topic was answered last.** `progression.ts:53-54` picks the most recently updated eligible topic, and `service.ts:179` bumps that timestamp on every graded answer. Trigger: after direct-objects' four cards, positions seven and eight test imported PRODUCTION_PRACTICE topics such as qui-que. Tomorrow's mix makes that topic current unless direct-objects was reopened. Fix: derive current from the most recent non-mixed topic session, or add a last-studied timestamp written only when the topic's own session starts or completes.

6. **Low. One ungraded answer voids a whole round.** `service.ts:313` counts ungraded attempts toward the target, so the round still ends after twenty asked, and `service.ts:212` then marks nineteen graded as insufficient and discards a 17 of 19 pass. This respects the owner's no-promotion rule but wastes the session. Fix: count only graded non-remediation attempts toward the target and end as insufficient only after target plus five have been asked.

7. **Low. Lifetime miss counts make one later slip behave as a third miss.** `misses` at `service.ts:169` never resets after a tag clears. Trigger: a tag reached three misses weeks ago and was cleared; one new miss during maintenance makes misses four, which schedules a 15-minute retrieval at line 172 and flips the topic to REVISIT_REQUIRED at line 176. Fix: reset misses to 0 when the review date clears at zero weight, or count misses since the last clear.

8. **Low, finding 1 residual. The reteach flag lives only in the latest session.** `service.ts:120` reads the most recent session's outcome. A production round under 70 percent followed by an early exit from Check what I remember writes outcome left, and Continue then skips the theory refresh. Fix: persist a needs-theory flag on topic progress, set on reteach and cleared on confirm.

Minor: `src/app/topics/[id]/page.tsx:122` shows a past date as Next review while an overdue tag is pending. Show review due now when the date has passed.

## Original findings status

| # | Status | Note |
|---|---|---|
| 1 | Resolved | Residual edge in finding 8 above |
| 2, 3, 5, 7, 8, 9, 13, 14, 15, 16, 17, 18, 19, 20, 21 | Resolved | Verified in code and covered by the review script or browser script |
| 4 | Resolved as designed | Forced retesting works; findings 1, 2 and 7 above are side effects |
| 6 | Resolved | Finding 6 above is a cost, not a correctness gap |
| 10 | Resolved | Explicit runner per owner decision |
| 11 | Partial | Finding 5 above |
| 12 | Partial | Finding 4 above |

## Coverage, migration and uncertainties

- **Regression gaps** in `scripts/verify-topics-review.ts`: no daily-mix credit with a realistic pool, no fail-then-rebuild ladder check, no partial outage with one ungraded answer in twenty, no forced-tag saturation or off-topic tag check because the fixture accepts any tag, no two-mix drift check, no repeat-miss check on a cleared tag. The unit test for the daily plan never uses five or more candidates, so slot distribution is untested.
- **Migration runner** is sound: idempotent CREATE IF NOT EXISTS, a PRAGMA guard, and the column plus backfill in one write batch. Two notes. It reads SQL relative to the working directory, so it must run from the repo root as documented. On a database where the old code already ran, due_at may hold an error date, so the backfilled maintenance date can be earlier than the true ladder date. That is the safe direction and production has no attempts.
- **Intent check.** Explain the rule on a maintained topic becomes a ten-question assessed round via `service.ts:271-272`. Nine of ten passes and a due pass advances the ladder. Six or fewer sends the topic to theory and guided practice. If a refresher should not carry state consequences, make theory-mode practice on maintained topics non-assessed.
- **Deadline risk.** The 25-second curriculum deadline at `providers.ts:235` may be short for CLI question generation with sixty previous prompts at medium or high reasoning, which would route most calls to the billed API. The provider_events table will show this after a few real sessions.
- **Schema drift.** The zod length caps and the four-tag limit at `ai.ts:12-16` are not in the JSON schemas sent to providers, so a verbose model fails validation and triggers fallback rather than a retry on the same provider.

Findings 1 through 3 are worth fixing before production migration because they shape the first real production round and the first maintenance failure. The rest can follow.
