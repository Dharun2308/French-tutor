#!/usr/bin/env python3
"""Upgrade the existing primary account to Docs write access; secrets stay local.

Run `begin` to print a consent URL; run `finish` and supply the full callback URL
on stdin. Existing credentials are backed up only after account/scope verification.
"""
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse

ROOT = Path.home() / ".hermes"
TOKEN = ROOT / "google_token_dharun561561.json"
CLIENT = ROOT / "google_client_secret_dharun561561.json"
PENDING = ROOT / "google_oauth_pending_french_editor.json"
WRITE = "https://www.googleapis.com/auth/documents"
READ = "https://www.googleapis.com/auth/documents.readonly"
ACCOUNT = "dharun561561@gmail.com"
REDIRECT = "http://127.0.0.1:8767/"


def save(path, payload):
    temporary = path.with_name(path.name + ".tmp")
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(payload, stream, indent=2)
    os.replace(temporary, path)


def begin():
    from google_auth_oauthlib.flow import Flow
    previous = json.loads(TOKEN.read_text())
    scopes = sorted(set(previous["scopes"]) | {WRITE})
    flow = Flow.from_client_secrets_file(str(CLIENT), scopes=scopes, redirect_uri=REDIRECT,
                                         autogenerate_code_verifier=True)
    url, state = flow.authorization_url(access_type="offline", prompt="consent", login_hint=ACCOUNT)
    save(PENDING, {"state": state, "code_verifier": flow.code_verifier,
                   "scopes": scopes, "redirect_uri": REDIRECT})
    print(url)


def finish():
    import requests
    from google_auth_oauthlib.flow import Flow
    pending = json.loads(PENDING.read_text())
    callback = urlparse(sys.stdin.read().strip())
    params = parse_qs(callback.query)
    if callback.hostname != "127.0.0.1" or callback.port != 8767 or params.get("state", [None])[0] != pending["state"]:
        raise ValueError("Invalid callback")
    code = params.get("code", [None])[0]
    if not code:
        raise ValueError("Missing authorization code")
    os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] = "1"
    flow = Flow.from_client_secrets_file(str(CLIENT), scopes=pending["scopes"],
                                         redirect_uri=pending["redirect_uri"], state=pending["state"],
                                         code_verifier=pending["code_verifier"])
    flow.fetch_token(code=code)
    credentials = flow.credentials
    actual = set(credentials.granted_scopes or flow.oauth2session.token.get("scope", "").split())
    required = set(pending["scopes"]) - {READ}
    if not required.issubset(actual) or not credentials.refresh_token:
        raise ValueError("Required scopes or refresh token missing")
    response = requests.get("https://gmail.googleapis.com/gmail/v1/users/me/profile",
                            headers={"Authorization": "Bearer " + credentials.token}, timeout=30)
    response.raise_for_status()
    if response.json().get("emailAddress", "").lower() != ACCOUNT:
        raise ValueError("Wrong Google account")
    payload = json.loads(credentials.to_json())
    payload.update({"scopes": sorted(actual), "type": "authorized_user"})
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    save(TOKEN.with_name(TOKEN.name + ".bak-editor-" + stamp), json.loads(TOKEN.read_text()))
    save(TOKEN, payload)
    PENDING.unlink()
    print("Google Docs write access connected for " + ACCOUNT + ". Existing Gmail/Calendar access preserved.")


if __name__ == "__main__":
    try:
        if sys.argv[1:] == ["begin"]:
            begin()
        elif sys.argv[1:] == ["finish"]:
            finish()
        else:
            raise ValueError("Use begin or finish")
    except Exception:
        # OAuth exceptions may contain token payloads. Print no raw exception details.
        print("Connection could not be completed. Check connection status, the account, consent and latest callback before retrying. No credential details were logged.", file=sys.stderr)
        sys.exit(1)
