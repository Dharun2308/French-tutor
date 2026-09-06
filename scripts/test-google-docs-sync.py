import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("sync_google_docs", Path(__file__).with_name("sync-google-docs.py"))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def paragraph(text):
    return {"paragraph": {"elements": [{"textRun": {"content": text + "\n"}}]}}


def document(lines, doc_id="selected-document"):
    return {"documentId": doc_id, "title": "Lesson", "tabs": [{
        "tabProperties": {"tabId": "first", "title": "First"},
        "documentTab": {"body": {"content": [paragraph(line) for line in lines]}},
    }]}


class FakeClient:
    def __init__(self, doc):
        self.doc = doc
        self.batches = {}
        self.fail_extract = False
        self.extract_calls = []
        self.fail_register_once = False

    def document(self, _):
        return self.doc

    def register(self, body):
        key = (body["documentId"], body["tabId"], body["text"])
        if key not in self.batches:
            self.batches[key] = {"batchId": len(self.batches) + 1, "status": "pending", "extracted": False}
        if self.fail_register_once:
            self.fail_register_once = False
            raise RuntimeError("Response lost after successful registration")
        return self.batches[key]

    def extract(self, batch_id):
        self.extract_calls.append(batch_id)
        if self.fail_extract:
            raise RuntimeError("Provider unavailable")
        for batch in self.batches.values():
            if batch["batchId"] == batch_id:
                batch["extracted"] = True


class SyncTests(unittest.TestCase):
    def test_nested_tabs_tables_and_unicode(self):
        doc = document(["Je suis prêt."])
        doc["tabs"][0]["childTabs"] = [{"tabProperties": {"tabId": "child", "title": "Later lesson"},
            "documentTab": {"body": {"content": [{"table": {"tableRows": [{"tableCells": [{
                "content": [paragraph("J’ai étudié le français.")]}]}]}}]}}}]
        tabs = sync.document_tabs(doc)
        self.assertEqual([t["id"] for t in tabs], ["first", "child"])
        self.assertEqual(tabs[1]["paragraphs"], ["J’ai étudié le français."])
        self.assertEqual(sync.fingerprint("e\u0301cole\n"), sync.fingerprint("école"))

    def test_chunks_keep_all_long_content_within_api_limit(self):
        text = "😀" * 12000
        chunks = list(sync.chunks([text]))
        self.assertEqual("".join(chunks), text)
        self.assertTrue(all(len(chunk.encode("utf-16-le")) // 2 <= 10000 for chunk in chunks))

    def test_repeat_edit_delete_reorder_and_add(self):
        fake = FakeClient(document(["Je parle français.", "Il est grand."]))
        previous, _ = sync.register_document(fake.doc, {}, fake.register)
        self.assertEqual(len(fake.batches), 1)
        previous, _ = sync.register_document(document(["Il est grand.", "Je parle  français."]), previous, fake.register)
        self.assertEqual(len(fake.batches), 1, "reordering/formatting does not reimport")
        previous, _ = sync.register_document(document(["Elle est grande.", "Je suis prêt."]), previous, fake.register)
        self.assertEqual(len(fake.batches), 2)
        last_text = list(fake.batches)[-1][2]
        self.assertIn("Elle est grande.", last_text)
        self.assertNotIn("Il est grand.", last_text)
        sync.register_document(document([]), previous, fake.register)
        self.assertEqual(len(fake.batches), 2, "deletion does not generate practice")

    def test_extraction_failure_retries_saved_batch_without_duplicate(self):
        with tempfile.TemporaryDirectory() as folder:
            config = {"state_directory": folder, "document_ids": ["selected-document"]}
            fake = FakeClient(document(["Je parle français."]))
            fake.fail_extract = True
            state = sync.sync(config, fake)
            self.assertTrue(state["errors"])
            self.assertEqual(state["pending"], [1])
            fake.fail_extract = False
            state = sync.sync(config, fake)
            self.assertEqual(state["pending"], [])
            self.assertEqual(state["errors"], [])
            self.assertEqual(len(fake.batches), 1)
            self.assertEqual(fake.extract_calls, [1, 1])
            self.assertIn("lastSuccessAt", state)
            sync.sync(config, fake)
            self.assertEqual(fake.extract_calls, [1, 1])

    def test_lost_registration_response_reuses_existing_batch(self):
        with tempfile.TemporaryDirectory() as folder:
            config = {"state_directory": folder, "document_ids": ["selected-document"]}
            fake = FakeClient(document(["Je parle français."]))
            fake.fail_register_once = True
            state = sync.sync(config, fake)
            self.assertEqual(state["documents"], {})
            self.assertTrue(state["errors"])
            state = sync.sync(config, fake)
            self.assertEqual(len(fake.batches), 1)
            self.assertEqual(state["pending"], [])
            self.assertFalse(state["errors"])


if __name__ == "__main__":
    unittest.main()
