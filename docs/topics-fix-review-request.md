Review the current French-tutor worktree, read-only, using Read/Glob/Grep only. Do not edit,
execute commands, call APIs, or inspect databases or secret files. Model fable, effort max.

This is the follow-up to docs/claude-fable-topics-review-20260905.md. The owner has resumed work.
All Topics and weekly-phrase code is still uncommitted/untracked; inspect the actual files.
Check the fixes for all 21 findings, especially src/lib/curriculum/service.ts, progression.ts,
ai.ts, types.ts, schema.ts, topics/[id]/page.tsx, providers.ts and openai.ts. Review the new
scripts/verify-topics-review.ts coverage and migration scripts/migrate-topics.ts and
scripts/migrate-2026-09-05-topics-review.sql. Look for regressions and missed edge cases.

Intentional decisions:
- Pending error dates, including overdue zero-weight tags, are actually retested; only successful
  retrieval advances/clears a tag. A generic session pass must not erase untested error evidence.
- maintenance_due_at is separate from due_at (the earliest maintenance/error date). Voluntary
  early passes preserve step/date; a due pass advances. Daily mix credits due maintained topics
  only with at least two independent correct written attempts, with no ungraded written attempts.
- Outages save ungraded feedback and do not count toward accuracy/errors. A round with fewer than
  its required graded questions cannot promote/demote the topic just because grading was unavailable.
- Schema migration is explicit, idempotent and additive, with the app stopped and DB backed up.
  No boot-time schema mutation and no db:push on production. Fresh/restored DBs use the migration
  runner; both schema files are now in Drizzle config. Communication IDs are explicit unchanged IDs.
- Both CLI providers and API remain enabled by owner request. Curriculum deadlines are shorter,
  API calls now have a real timeout with SDK retries disabled, and targeted theory/questions run
  concurrently. Ungraded does not apply to generation failure; session stays saved for retry.

Deterministic integration scripts currently pass for both original and new regression branches.
Give only reproducible remaining bugs or meaningful uncertainties, with severity, file/line,
trigger and concrete fix. Mark the original findings resolved/partial/outstanding as appropriate.
Do not repeat the previous stale claims about missing migrations or API being disabled.
