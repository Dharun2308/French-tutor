# Weekly Google Docs lesson imports

Hermes schedules a script-only job for Wednesday 00:00 in America/Denver. The small
`scripts/weekly-google-docs.sh` launcher starts `french-google-docs-sync.service`, whose
worker has a two-hour timeout independent of Hermes's short cron-launcher timeout.
The worker runs `scripts/sync-google-docs.py` with Hermes's Python environment.

## Local configuration

`~/.hermes/french-google-docs.json` (mode 0600, outside Git) contains:

```json
{
  "google_token_file": "/home/multi_mind/.hermes/google_token_dharun561561.json",
  "tutor_url": "http://127.0.0.1:8095",
  "state_directory": "/home/multi_mind/French-tutor/.google-docs-sync",
  "document_ids": ["FIRST_SELECTED_DOCUMENT_ID", "SECOND_SELECTED_DOCUMENT_ID"]
}
```

The selected account needs read access to both shared documents and the
`documents.readonly` OAuth permission. Google Docs API must be enabled for its
OAuth client's project. An external OAuth application in Testing may lose its
refresh token after seven days; use an appropriate production publishing status
for unattended weekly operation. Reauthorization is still needed if access is revoked.

## Behavior and recovery

- The first run reads all selected documents, including nested tabs and text in
  tables. Images, comments, and handwritten annotations are not imported as text.
- Subsequent runs collect new or edited paragraphs. Unicode normalization,
  whitespace changes, reordering and already-seen paragraphs do not create new
  imports. Deletion in Docs does not delete learning history.
- Changed paragraphs become bounded sections (up to 4,500 Unicode characters).
  Raw note snapshots and progress stay in ignored `.google-docs-sync/state.json`.
- `/api/import/google-docs` atomically registers each section using its document,
  tab and text as identity. A lost response or repeated delivery returns the same
  batch, including if the batch has already been reviewed/discarded.
- The worker uses the existing extraction/provider chain to prepare pending
  drafts. It never commits learning items. Review and approve under **Import**.
- A durable pending list is saved before extraction. Provider errors preserve
  those imports for the next run or **Retry extraction** in the app. Reading a
  prepared batch does not regenerate or overwrite the draft.
- A file lock and the systemd service prevent overlapping workers. Success is
  silent; errors are recorded in local state and the service journal. No messages
  are sent to other people. The Import page shows the schedule, last successful
  update, source links, pending preparation and whether attention is needed.

Manual retry: `systemctl --user start french-google-docs-sync.service`.
Status: `systemctl --user show french-google-docs-sync.service -p ActiveState -p Result`.
Logs: `journalctl --user -u french-google-docs-sync.service -n 30`.
Keep snapshots when restoring the app, to avoid scanning old notes again. Durable
server batch identity protects identical deliveries if a local checkpoint is lost.
If the notes themselves change before an interrupted registration is retried, the
new section boundaries can differ; the existing item-level deduplication on approval
still merges duplicate learning items.

## Validation

Test in an isolated checkout and disposable DB before installing the Hermes launcher:

```sh
python3 scripts/test-google-docs-sync.py
TURSO_DATABASE_URL=file:/tmp/french-google-docs-intake-test.db node --import tsx scripts/verify-google-docs.ts
npm test
npm run build
```

The integration DB must first be prepared from a backup/copy, never the live DB.
Checks cover nested tabs/tables, accents, long paragraphs, changed/deleted/reordered
notes, repeated delivery, lost responses, extraction failure recovery, preservation
of prepared/discarded drafts, concurrent intake and unchanged learning items.
