import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("editor", Path(__file__).with_name("google-docs-editor.py"))
editor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(editor)


def paragraph(text, start=1, **extra):
    return {"startIndex": start, "endIndex": start + editor.utf16(text + "\n"),
            "paragraph": {"elements": [{"textRun": {"content": text + "\n", **extra}}]}}


def document(text="Bonjour 😀, ça va ?"):
    return {"documentId": "tutor-doc", "title": "Lesson notes", "revisionId": "rev-1", "tabs": [{
        "tabProperties": {"tabId": "tab-1", "title": "Lesson"},
        "documentTab": {"body": {"content": [paragraph(text)]}}}]}


class FakeGoogle:
    can_write = True

    def __init__(self):
        self.doc = document()
        self.writes = []

    def get(self, doc_id):
        return copy.deepcopy(self.doc)

    def request(self, method, suffix, payload):
        self.writes.append((suffix, payload))
        return {"documentId": "personal-doc"} if not suffix else {}


class EditorTests(unittest.TestCase):
    def test_unicode_changes_touch_only_changed_ranges(self):
        old = "Émilie 😀 n’est pas allée à Montréal."
        new = "Émilie 😃 n’est jamais allée à Québec."
        block = {"text": old, "start": 1}
        requests = editor.edit_requests(block, new, "tab-2")
        encoded = (old + "\n").encode("utf-16-le")
        for request in requests:
            if "deleteContentRange" in request:
                r = request["deleteContentRange"]["range"]
                self.assertEqual(r["tabId"], "tab-2")
                encoded = encoded[:(r["startIndex"] - 1) * 2] + encoded[(r["endIndex"] - 1) * 2:]
            else:
                r = request["insertText"]
                index = (r["location"]["index"] - 1) * 2
                encoded = encoded[:index] + r["text"].encode("utf-16-le") + encoded[index:]
            encoded.decode("utf-16-le")  # No half-surrogate operation.
        self.assertEqual(encoded.decode("utf-16-le"), new + "\n")
        self.assertEqual(editor.edit_requests(block, old, "tab-2"), [])

    def test_nested_tabs_tables_strikes_and_objects(self):
        doc = document()
        child = {"tabProperties": {"tabId": "child", "title": "Corrections"}, "documentTab": {"body": {"content": [
            {"table": {"tableRows": [{"tableCells": [{"content": [paragraph("erreur", 5, textStyle={"strikethrough": True})]}]}]}},
            {"startIndex": 20, "endIndex": 22, "paragraph": {"elements": [{"inlineObjectElement": {"inlineObjectId": "image"}}, {"textRun": {"content": "\n"}}]}},
            paragraph("suggestion", 23, suggestedInsertionIds=["s1"]),
        ]}}}
        doc["tabs"][0]["childTabs"] = [child]
        output = editor.present(doc, True)
        blocks = output["tabs"][1]["blocks"]
        self.assertEqual(output["tabs"][1]["id"], "child")
        self.assertTrue(blocks[0]["runs"][0]["strike"])
        self.assertTrue(blocks[0]["table"])
        self.assertTrue(blocks[0]["editable"])
        self.assertFalse(blocks[1]["editable"])
        self.assertFalse(blocks[2]["editable"])

    def test_conflicts_permissions_and_allowlist_never_write(self):
        with tempfile.TemporaryDirectory() as directory:
            personal = Path(directory) / "personal.json"
            config = {"document_ids": ["tutor-doc", "second-doc"]}
            google = FakeGoogle()
            body = {"action": "edit", "id": "tutor-doc", "tabId": "tab-1", "revision": "stale", "start": 1, "text": "Salut"}
            for change, status in [({}, 409), ({"id": "unselected-doc"}, 403), ({"revision": "rev-1", "start": 99}, 400)]:
                with self.assertRaises(editor.EditorError) as error:
                    editor.handle({**body, **change}, config, google, personal)
                self.assertEqual(error.exception.status, status)
            google.can_write = False
            with self.assertRaises(editor.EditorError):
                editor.handle({**body, "revision": "rev-1"}, config, google, personal)
            self.assertEqual(google.writes, [])

    def test_atomic_revision_control_edit_and_append(self):
        with tempfile.TemporaryDirectory() as directory:
            personal = Path(directory) / "personal.json"
            google = FakeGoogle()
            body = {"action": "edit", "id": "tutor-doc", "tabId": "tab-1", "revision": "rev-1", "start": 1, "text": "Bonjour 😀, ça va bien ?"}
            self.assertEqual(editor.handle(body, {"document_ids": ["tutor-doc"]}, google, personal), {"saved": True})
            self.assertEqual(google.writes[0][1]["writeControl"], {"requiredRevisionId": "rev-1"})
            editor.handle({**body, "action": "append", "text": "Ma note"}, {"document_ids": ["tutor-doc"]}, google, personal)
            self.assertEqual(google.writes[1][1]["requests"][0]["insertText"]["endOfSegmentLocation"], {"tabId": "tab-1"})

    def test_personal_creation_reuses_id_and_does_not_change_import_list(self):
        with tempfile.TemporaryDirectory() as directory:
            personal = Path(directory) / "personal.json"
            google = FakeGoogle()
            config = {"document_ids": ["tutor-doc", "second-doc"]}
            for _ in range(2):
                self.assertEqual(editor.handle({"action": "create"}, config, google, personal), {"id": "personal-doc"})
            self.assertEqual(len(google.writes), 1)
            self.assertEqual(personal.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(editor.handle({"action": "list"}, config, google, personal)["documents"]), 3)
            self.assertEqual(config["document_ids"], ["tutor-doc", "second-doc"])

    def test_empty_edit_keeps_final_newline_and_rejects_control_characters(self):
        requests = editor.edit_requests({"text": "é😀", "start": 5}, "", "tab")
        self.assertEqual(requests, [{"deleteContentRange": {"range": {"startIndex": 5, "endIndex": 8, "tabId": "tab"}}}])
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(editor.EditorError):
                editor.handle({"action": "append", "id": "tutor-doc", "tabId": "tab-1", "revision": "rev-1", "text": "bad\x00"},
                              {"document_ids": ["tutor-doc"]}, FakeGoogle(), Path(directory) / "personal.json")


if __name__ == "__main__":
    unittest.main()
