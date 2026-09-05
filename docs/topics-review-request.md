# Read-only Fable review — Topics and weekly phrase practice

Review the CURRENT worktree in /home/multi_mind/French-tutor. Use Claude fable at max effort.
Do not edit, commit, deploy, call APIs, or touch databases. Use Read, Glob, Grep. Return the report
as your final response; a detached systemd service captures output durably.

Read HANDOFF.md and docs/topics-design.md. Inspect ALL new/untracked source files as well as
modified ones. Ignore the older docs/claude-fable-review-2026-09-03.md.

Main scope: src/lib/curriculum/*.ts, src/app/api/topics/**, src/app/topics/**,
scripts/migrate-2026-09-05-topics.sql, tests/curriculum.test.ts, scripts/verify-topics.ts,
scripts/smoke-topics.ts, scripts/verify-topics-browser.mjs. Also inspect providers.ts, lib/api.ts,
types/index.ts, provider-status.tsx, app/page.tsx, lib/items/weekly-practice*.ts, focus-plan.ts,
api/items/session, api/focus-session, personal-practice-card.tsx, practice/smart and practice/focus.

Owner requirements: individual grammar topics (articles, pronouns, etc), based on a detailed
ChatGPT history, late A1/early A2 aiming at NCLC7/B2. Covered topics are self-reported coverage,
never fabricated scores/mastery. Direct object pronouns are NEW. Preserve advanced and listening/
communication roadmap. Previously practiced topics should skip introductory theory unless requested.
New topics: concise theory, 5–10 controlled, 10–20 independent full-sentence questions. One at a time.
At >=85% conceptual accuracy move to maintenance; 70–84% short subrule refresh and 5–10 targeted
questions, below70% brief reteaching then controlled. Hints/reveals/remediation must not inflate
independent accuracy. Minor spelling/œ slips differ from wrong grammar. Separate theory,
controlled accuracy, independent production and automatic conversation. Do not certify oral
automaticity from writing or self-reported speaking. Oral prompts start after written readiness.

After mistakes show exact submitted sentence, corrected sentence, concise ENGLISH explanation,
then similar NEW question. Three repeated category errors get three immediate follow-ups, ~15min
and next-day retrieval. Error weights increase with misses and decay on successful retrieval.
Maintenance intervals roughly 1,3,7,14,30 days. Daily mix roughly20% old,40% current,20% mixed,
20% oral once ready. Never surprise the learner with unstudied advanced grammar in a mixed test.
All instructions, hints and explanations in English; French only for practiced sentences/audio.

Sessions must resume after reload; retries/concurrent tabs must not double-save or skip cards.
Answer keys stay private until check/reveal; AI failures must preserve sessions. Providers:
Codex gpt-5.6-sol/medium → Claude opus/high → OpenAI API final fallback (explicitly enabled now).
Dashboard Topics button replaces View Active10; the Woven into... sentence was removed.
Tutor Mode was replaced with automatic weekly-phrase practice in Focus/Smart.

Tests already passed: TypeScript/unit suite/build; deterministic disposable-DB integration for
progression thresholds, retries, hidden answers, hints, targeted remediation and resume; live
Codex sol and Claude Opus connectivity; real Codex generated lessons and distinguished minor
œ slip from wrong feminine plural agreement. Chromium phone interaction on isolated DB tested
theory→practice→answer→correction→reload→follow-up→reveal. Production has zero fabricated topic
attempts; existing27 learning items,33 reviews,8 import batches preserved with pre-migration backup.

Find reproducible bugs and useful improvements. Prioritize learning correctness, state transitions,
scheduling, grading fairness, interruption/retry/data integrity, provider failure and mobile UX.
Give severity, exact file:line, trigger, consequence and concrete fix for each finding. Distinguish
confirmed bugs from uncertainties and optional improvements. Inspect untested branches instead
of relying on tests. End with readiness assessment and three highest-value improvements.
