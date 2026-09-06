# Google Docs notes editor

`/notes` provides a text editor for the two configured italki documents plus one
personal document. It reads live Google Docs data through a server-side Python
bridge using Hermes's existing primary-account credentials. Tokens and client
secrets never go to the browser. No new app dependencies or DB migrations.

The Notes page allows paragraph text edits and appending notes. It displays bold,
italic and strikethrough runs, nested document tabs and table-cell text. It is not
a full Google Docs layout editor: images, comments, table structure, generated
tables of contents and other objects remain in the source document; complex or
suggested text elements cannot be edited here. Inserted text inherits surrounding
Google formatting. Unchanged text runs are preserved by descending minimal text
edits, with UTF-16 indices. Users can search paragraphs and open the original Doc.

Each write fetches the current document, checks the revision from the browser,
then submits an atomic Google `batchUpdate` with `requiredRevisionId`. Stale or
failed saves preserve the in-memory draft. Reload keeps the draft for comparison;
the user copies it and reopens the latest paragraph before saving. Navigation warns
about unsaved edits. Drafts are not persisted across a browser crash. Acknowledged
writes are not retried if the following read fails. After a lost response, the old
revision prevents blindly appending again. Google may require a reload after a long
editing session because revision IDs expire.

`scripts/google-docs-editor.py` enforces a document allowlist independently of the
browser: the first two IDs from `~/.hermes/french-google-docs.json`, plus the ID in
`~/.hermes/french-personal-notes.json`. Creating Personal Notes is serialized and
reuses its persisted ID. The latter file is private, mode 0600, outside Git.
If Google creates the document but the machine fails before persisting its ID,
recover its ID from Google Docs into that file before attempting creation again.
The editor cannot delete documents or change sharing. Shared tutor documents also
require the connected account to have Editor permission in Google.

POST `/api/notes` validates input and same-origin requests; this is a private
single-user app served through the existing Tailscale access boundary. Do not
publish the app on an unauthenticated public endpoint. The backend uses bounded
subprocess/API timeouts and sanitized errors. Refreshed editor tokens stay in memory
to avoid racing the weekly worker's token-file writes.

## Connection

Existing access is read-only until the owner completes this consent upgrade:

```
~/.hermes/hermes-agent/venv/bin/python scripts/connect-google-docs-editor.py begin
~/.hermes/hermes-agent/venv/bin/python scripts/connect-google-docs-editor.py finish
```

`finish` reads the complete localhost callback URL from stdin. It verifies OAuth
state/PKCE, granted scopes and the primary Gmail account before backing up and
atomically replacing its token. It preserves existing Gmail/Calendar grants and
adds the Google Docs scope. Google grants that scope across accessible Docs; the
editor restricts its own operations to the three selected files. A per-file
`drive.file` integration would instead require a file-picker authorization flow.
Pending OAuth state is in `~/.hermes/google_oauth_pending_french_editor.json` (0600).
Never commit or print tokens, client secrets, callback codes or the PKCE verifier.

The Wednesday import schedule is unchanged and still covers only the two italki
documents. Personal Notes is not automatically added to the study imports.

## Validation

`python3 scripts/test-google-docs-editor.py` checks Unicode range application,
structural newline preservation, nested tabs/tables/strikes, unsupported objects,
scope/allowlist checks, conflicts, required revisions and personal creation reuse.
Existing JS tests, Python weekly-sync tests and production build also pass.
Live reads of both tutor documents passed. Phone light/dark browser checks covered
the dashboard removal, Notes navigation, live read-only display, and simulated
edit/append/conflict/personal creation flows without modifying the tutor documents.
Live write verification remains pending owner consent.
