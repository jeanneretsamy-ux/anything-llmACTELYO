import json
from pathlib import Path
import shutil
import unittest
from uuid import uuid4

from legal_rag.core import load_corpus, passages
from legal_rag.cli import evaluate


class FakeIndex:
    def search(self, query, limit):
        return [{"id": "b"}, {"id": "a"}][:limit]


class LegalRagTests(unittest.TestCase):
    def test_corpus_integrity_and_repealed_filter(self):
        dest = Path(__file__).resolve().parents[1] / "data" / f"test-{uuid4().hex}"
        try:
            source = Path(__file__).resolve().parents[2] / "examples/rag-eval/legal-articles.sample.json"
            from subprocess import run
            prepared = Path(__file__).resolve().parents[2] / "server/scripts/prepare-legal-corpus.cjs"
            run(["node", str(prepared), "--input", str(source), "--output", str(dest)], check=True, capture_output=True)
            records, digest = load_corpus(dest)
            self.assertEqual([r["id"] for r in records], ["demo-1"])
            self.assertEqual(len(digest), 64)
            (dest / "current" / Path(json.loads((dest / "manifest.json").read_text())["articles"][0]["file"]).name).write_text("tampered")
            with self.assertRaises(ValueError):
                load_corpus(dest)
        finally:
            shutil.rmtree(dest, ignore_errors=True)

    def test_retrieval_metrics(self):
        report = evaluate(FakeIndex(), [{"id": "q", "query": "example", "relevant": ["a"]}])
        self.assertEqual(report["recall_at_1"], 0)
        self.assertEqual(report["recall_at_3"], 1)
        self.assertEqual(report["mrr"], 0.5)

    def test_long_article_is_split_without_losing_tail(self):
        text = "début " + "milieu " * 500 + "fin unique"
        parts = passages({"id": "1", "citation": "Art. 1", "text": text})
        self.assertGreater(len(parts), 1)
        self.assertIn("fin unique", parts[-1]["text"])
        self.assertTrue(all(len(p["text"]) <= 1250 for p in parts))


if __name__ == "__main__":
    unittest.main()
