#!/usr/bin/env python3
"""Fetch selected lesson Docs, register changed notes, and prepare review drafts.

Google credentials and selected IDs live outside Git in a local config file.
Run with Hermes's Python, which includes google-auth and requests.
"""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import unicodedata
from datetime import datetime, timezone


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    fd = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
    os.replace(temporary, path)


def paragraphs(contents):
    """Preserve paragraph/table order without treating URLs or metadata as notes."""
    for element in contents:
        paragraph = element.get("paragraph")
        if paragraph:
            text = "".join(part.get("textRun", {}).get("content", "") for part in paragraph.get("elements", []))
            text = unicodedata.normalize("NFC", text).strip()
            if text:
                yield text
        for row in element.get("table", {}).get("tableRows", []):
            for cell in row.get("tableCells", []):
                yield from paragraphs(cell.get("content", []))
        yield from paragraphs(element.get("tableOfContents", {}).get("content", []))


def document_tabs(document):
    def walk(tabs):
        for tab in tabs:
            props = tab.get("tabProperties", {})
            yield {"id": props.get("tabId", ""), "title": props.get("title", "Notes"),
                   "paragraphs": list(paragraphs(tab.get("documentTab", {}).get("body", {}).get("content", [])))}
            yield from walk(tab.get("childTabs", []))
    if document.get("tabs"):
        return list(walk(document["tabs"]))
    return [{"id": "", "title": "Notes", "paragraphs": list(paragraphs(document.get("body", {}).get("content", [])))}]


def fingerprint(text):
    # Formatting-only whitespace/Unicode changes do not create fresh practice.
    normalized = " ".join(unicodedata.normalize("NFC", text).split())
    return hashlib.sha256(normalized.encode()).hexdigest()


def chunks(lines, limit=4500):
    buffer = ""
    for line in lines:
        # A single unusually long paragraph must not exceed the import API limit.
        for start in range(0, len(line), limit):
            part = line[start:start + limit]
            if buffer and len(buffer) + len(part) + 2 > limit:
                yield buffer
                buffer = ""
            buffer = (buffer + "\n\n" + part).strip()
    if buffer:
        yield buffer


def register_document(document, previous, register):
    """Only checkpoint after every chunk is durably registered by the tutor."""
    tabs = document_tabs(document)
    seen = set(previous.get("seen", []))
    pending = []
    for tab in tabs:
        fresh = []
        for line in tab["paragraphs"]:
            key = fingerprint(line)
            if key not in seen:
                fresh.append(line)
                seen.add(key)
        for index, text in enumerate(chunks(fresh), 1):
            result = register({"documentId": document["documentId"], "tabId": tab["id"],
                               "title": f"{document.get('title', 'Lesson notes').strip()} · {tab['title']} · {index}"[:200],
                               "text": text})
            if result["status"] == "pending" and not result["extracted"]:
                pending.append(result["batchId"])
    return {"title": document.get("title", "Lesson notes").strip(), "tabs": tabs,
            "seen": sorted(seen), "fetchedAt": timestamp()}, pending


class Client:
    def __init__(self, config):
        import requests
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
        self.http = requests.Session()
        self.base = config["tutor_url"].rstrip("/")
        self.token_path = Path(config["google_token_file"]).expanduser().resolve()
        self.credentials = Credentials.from_authorized_user_file(str(self.token_path))
        if not self.credentials.valid:
            self.credentials.refresh(Request())
            payload = json.loads(self.credentials.to_json())
            payload["type"] = "authorized_user"
            save_json(self.token_path, payload)

    def document(self, doc_id):
        response = self.http.get("https://docs.googleapis.com/v1/documents/" + doc_id,
                                 headers={"Authorization": "Bearer " + self.credentials.token},
                                 params={"includeTabsContent": "true"}, timeout=45)
        if response.status_code != 200:
            raise RuntimeError(f"Google Docs returned HTTP {response.status_code}; check sharing and the Google connection.")
        return response.json()

    def register(self, body):
        response = self.http.post(self.base + "/api/import/google-docs", json=body, timeout=45)
        if response.status_code != 200:
            raise RuntimeError(f"Could not register notes: tutor HTTP {response.status_code}.")
        return response.json()

    def extract(self, batch_id):
        response = self.http.get(self.base + "/api/import/batches", params={"id": batch_id}, timeout=30)
        if response.status_code != 200:
            raise RuntimeError(f"Could not read import {batch_id}: HTTP {response.status_code}.")
        batch = response.json()
        if batch["status"] != "pending" or batch.get("extraction"):
            return
        response = self.http.post(self.base + "/api/import/extract", json={"batchId": batch_id}, timeout=510)
        if response.status_code != 200:
            raise RuntimeError(f"Import {batch_id} needs another extraction attempt; open it in Import to retry.")


def sync(config, client):
    directory = Path(config["state_directory"]).expanduser()
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / "sync.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return {"skipped": "already running"}
        state_path = directory / "state.json"
        state = json.loads(state_path.read_text()) if state_path.exists() else {"documents": {}, "pending": []}
        state["lastAttemptAt"] = timestamp()
        state["errors"] = []
        state["running"] = True
        save_json(state_path, state)
        for doc_id in config["document_ids"]:
            try:
                document = client.document(doc_id)
                updated, pending = register_document(document, state["documents"].get(doc_id, {}), client.register)
                state["documents"][doc_id] = updated
                state["pending"] = sorted(set(state["pending"] + pending))
            except Exception as error:
                state["errors"].append(f"Document {doc_id}: {type(error).__name__}: {error}")
            save_json(state_path, state)
        for batch_id in list(state["pending"]):
            try:
                client.extract(batch_id)
                state["pending"].remove(batch_id)
            except Exception as error:
                state["errors"].append(f"Import {batch_id}: {type(error).__name__}: {error}")
            save_json(state_path, state)
        state["running"] = False
        if not state["errors"]:
            state["lastSuccessAt"] = timestamp()
        save_json(state_path, state)
        return state


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path.home() / ".hermes/french-google-docs.json")
    args = parser.parse_args()
    config = None
    try:
        config = json.loads(args.config.read_text())
        state = sync(config, Client(config))
        if state.get("errors"):
            print("\n".join(state["errors"]), file=sys.stderr)
            return 1
    except Exception as error:
        # Avoid logging OAuth exception bodies containing credential material.
        message = f"Google Docs sync could not start: {type(error).__name__}. Check Google authentication and the local configuration."
        print(message, file=sys.stderr)
        if config:
            try:
                state_path = Path(config["state_directory"]).expanduser() / "state.json"
                state = json.loads(state_path.read_text()) if state_path.exists() else {"documents": {}, "pending": []}
                state.update({"running": False, "lastAttemptAt": timestamp(), "errors": [message]})
                save_json(state_path, state)
            except Exception:
                pass  # Preserve unreadable state for recovery instead of discarding snapshots.
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
