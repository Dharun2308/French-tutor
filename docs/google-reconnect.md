# Reconnect Google

Notes and Import have a compact Google connection line, the last import result
and time, and **Reconnect Google**. Reconnecting never starts an import, edits a
document, creates Personal Notes or changes learner data. No migration or new
dependency is needed.

## Using it

With the existing Desktop client, tap **Reconnect Google**, approve the existing
permissions in the Google tab, copy that tab's full address when the loopback page
cannot load, then paste it into **Paste the full address** and tap **Connect**.
Keep the same browser. The request expires after ten minutes; starting again
replaces the browser binding. A blocked popup gets an **Open Google** link.

A configured Web client is detected from its `web` key. It uses
`https://<app-host>:<app-port>/api/google/callback` and returns automatically to
Notes. Only that mode shows the exact redirect URI and a Copy button. A new Web
client requires that URI to be registered with Google; the existing Desktop flow
requires no Cloud Console change.

For the owner (root cause):

External OAuth apps in **Testing** issue seven-day refresh tokens for these scopes; the timing fits, but local `RefreshError` does not prove that setting.
If still Testing, choose **Google Auth Platform → Audience → Publish app** (**In production**), then reconnect to remove the seven-day limit.
The unverified-app warning is expected for personal use; other revocations remain possible.

Sources: Google's [Audience documentation](https://support.google.com/cloud/answer/15549945),
[personal-use verification exemption](https://support.google.com/cloud/answer/13464323)
and [Desktop OAuth flow](https://developers.google.com/identity/protocols/oauth2/native-app).

## Investigation and compatibility

- The configured credential export has an `installed` object (Desktop), rather
  than `web`. Inspection was limited to JSON key names, permissions and path
  relationships. Secret values were not printed.
- The weekly sync and Notes editor both read `google_token_file` from the existing
  private `~/.hermes/french-google-docs.json`. It points at the primary account's
  JSON token; Hermes' generic `google_token.json` is a symlink to the same file.
  The second account has a separate token and is not updated.
- The token uses Python `google.oauth2.credentials.Credentials` authorized-user
  JSON: `token`, `refresh_token`, `client_id`, `client_secret`, `token_uri`, `scopes`,
  `expiry`, `account`, `universe_domain`. Existing extra keys are preserved,
  including `type` if present. Replacement is mode 0600, same-directory atomic
  rename, with the previous bytes retained in a unique 0600 backup.
- Historical setup scripts request Gmail read/send/modify, Calendar and Docs read;
  the editor authorization adds Docs write. The new flow obtains its exact scope
  list from the existing token at runtime, never the newer Hermes default list.
  It requests no additional permissions and rejects missing/added grants (allowing
  Google to collapse Docs readonly when Docs write was already requested).
- Final validation found a mismatch with that historical setup: the **current**
  shared token's recorded grants contain none of the scopes accepted by
  [Docs documents.get](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/get).
  The code still allows starting consent with those exact grants, but fails closed
  if Google denies the subsequent document check. Restoring Docs permissions is
  a separate owner decision; adding Docs readonly was not authorized by this
  task's instruction to preserve scopes. No current scope values were printed.
- Other readers of the shared token are Hermes Google Workspace's `google_api.py`,
  `gws_bridge.py` and `setup.py`, via the generic symlink or `GOOGLE_TOKEN_FILE`.
  `google-account.sh` switches that symlink. Terminal reauthorization helpers also
  read/write credentials. No Hermes code or other account token is changed.
- The most recent journal entries on October 7 and 14 report startup
  `RefreshError` and exit 1. The sync deliberately suppresses upstream exception
  bodies, so the journal does not establish `invalid_grant` or Testing status.

The app verifies the existing account with a read-only Gmail profile request, then
reads only `documentId` metadata for the first configured document. The existing
Gmail permission is required for the shared-account check. It saves credentials
only after both succeed. Connection status performs an in-memory refresh and the
same metadata read, caches for 30 seconds, and never writes the token file.
Temporary Google/network failures show **Connection unavailable** rather than
asserting that consent expired.

The weekly worker now keeps access-token refreshes in memory, as the editor
already did. This prevents a long-running worker from overwriting a newly
reconnected token. Reconnect checks the original token/client fingerprint again
before saving, serializes reconnect writes, and preserves token symlinks.
External Hermes tools still do not cooperate with that lock: avoid running their
terminal reauthorization concurrently. An external write immediately after the
last check remains a race outside this repository's control.
If a process dies during a token save, its `.reconnect.lock` may remain. Confirm
no reconnect writer is running before removing that stale lock; retain the
`.bak-reconnect-*` backups for recovery. No automatic import is needed afterward.

## Configuration and security

Defaults reuse the existing private config and account-specific client export:
replace `google_token_` with `google_client_secret_` in the token filename.
An explicit `google_client_file` config key or `GOOGLE_RECONNECT_CLIENT_FILE`
environment variable overrides that discovery, including for a future Web client.
The expected account comes from `google_account` in config, the token's `account`,
or the existing account-specific filename convention.

`FRENCH_GOOGLE_DOCS_CONFIG` overrides the config path in the app and editor.
The sync CLI continues using its existing `--config` option.
`FRENCH_GOOGLE_PERSONAL_NOTES` overrides the editor's personal-document registry.
`GOOGLE_RECONNECT_STATE_DIR` overrides pending-state storage; by default it is
`.french-google-reconnect` beside the token. Use only private files outside Git.

- POSTs require an exact same-origin Origin header, including scheme and port.
  The existing trusted loopback Tailscale proxy supplies forwarded host/protocol.
  Keep the app private to the tailnet; it has no application login.
- Consent uses offline access, explicit consent and PKCE S256. Random state is
  browser-cookie and origin bound, single-use and valid for ten minutes.
  Private on-disk state survives server restarts; expired files are cleaned on
  subsequent starts, with a bounded number of pending attempts.
- The HttpOnly, SameSite=Lax cookie is Secure on HTTPS. Callback responses are
  uncached and set `Referrer-Policy: no-referrer`. Success/failure redirects contain
  no Google code. No token, code, secret or upstream exception is returned/logged.
- Pasted callbacks must exactly match the loopback origin/path, with one state
  and one code. The address is cleared on submission and never persisted in
  browser storage. Only the start timestamp is stored.
- `.gitignore` excludes credentials, backups, pending state, lock files, local
  databases and screenshots. Never put private client exports, verification
  databases or real screenshots containing learner data into the public repo.

## Verification

Run `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build`,
`python3 scripts/test-google-docs-sync.py`, and
`python3 scripts/test-google-docs-editor.py` in an isolated worktree.

The reconnect tests use disposable credential files and a loopback fake Google
endpoint. They cover PKCE, callback parsing, expiry, browser/origin binding,
single-use/concurrent state consumption, server restarts, denial, account/scope
validation, unavailable Google, token backups/modes/symlinks, concurrent changes,
Web-client detection, missing recorded Docs grants, read-only status and
failed/interrupted imports.

Browser verification must run the built app on a free loopback port 18000–18999,
with an SQLite backup and all Google paths set to fakes. Mock the existing Notes
and Import data responses to keep learner content out of screenshots. Exercise
the real reconnect routes against fake Google endpoints, including phone
390×844 light/dark and tablet 1024×1366 connected/reconnect-needed states.
Do not start an import or exercise document writes.

Deployment is performed by the orchestrator after review, following the room
brief's staged-build procedure. No service, timer, cron or schema changes are
required. Do not run the weekly sync as a deployment health check.
