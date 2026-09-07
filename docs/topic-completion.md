# Manual topic completion

Each real curriculum topic has a persistent manual Done/Unfinished marker, default
Unfinished. The control is visible above the overview and inside active lessons,
so unfamiliar vocabulary need not block the learner from marking a known rule done.
It preserves typed answers and saved lesson sessions. The Topics list shows a green
Done label, and manually completed topics are excluded from Needs review and the
overview's next/review recommendations. Practice remains available.

The marker is independent of assessed state, accuracy, attempts, error weights,
review dates and active session data. It does not award mastery, clear mistakes or
fabricate successful answers. Normal practice never clears the marker. Unfinished
restores the topic's normal display and review eligibility; it does not reset scores.

Done can satisfy a topic prerequisite, including the session-start check. Reverting
to Unfinished restores the normal prerequisite gate for topics not yet started.
Already-started topics retain the existing resume behavior. Speaking still uses its
measured-accuracy gate; manual completion does not fabricate speaking readiness.
Existing mixed-practice scheduling is unchanged and may still review studied rules.

`PATCH /api/topics` accepts `{ topicId, manualDone: boolean }`, validates actual
catalog IDs (excluding the synthetic mixed route), and updates only `manual_done`.
The independent boolean is stored in `topic_progress`; no other progress columns
are changed. Save failures preserve the displayed status and offer the same control
for retry. All users' existing topics initially remain manually unfinished.

## Migration and checks

The additive `manual_done INTEGER NOT NULL DEFAULT 0` column is defined in
`scripts/migrate-2026-09-06-topic-completion.sql`. The existing `migrate-topics.ts`
runner checks columns before applying it, so repeated execution is safe. Test on a
disposable DB, stop the app and back up before applying to the live SQLite DB. Do
not use db:push. Older app versions can read the DB with the extra column present.

`scripts/verify-topic-completion.ts` requires `TURSO_DATABASE_URL=file:/tmp/...` and
verifies the repeated migration, persistence/toggle for every catalog topic, invalid
inputs, unchanged measured progress/history/sessions and matching prerequisite
behavior in the overview and session-start service. It never invokes a real model.

Deployed September 7, 2026 after a private SQLite backup. Comparison with that
backup verified all existing table data was unchanged by the additive migration.
Production build and tests passed; the live API returns completion status for all
112 topics. Phone light/dark checks covered active-session and overview controls,
typed-answer preservation, reload/list badge, unchanged displayed accuracy and
failed-save retry. Browser toggles were simulated; the owner's manual choices were
not changed by verification. Screenshots: `google-docs-topic-mark-done-*.png` in
`~/snap/chromium/common/shots/`.
