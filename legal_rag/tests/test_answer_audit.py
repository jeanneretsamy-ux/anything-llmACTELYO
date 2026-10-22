import unittest
from pathlib import Path
from uuid import uuid4

from legal_rag.answer_audit import audit_answers
from legal_rag.cli import write_report


class AnswerAuditTests(unittest.TestCase):
    def test_citations_and_human_review(self):
        report = audit_answers([{"id": "q1", "answer": "Réponse [1] et [3]", "sources": [
            {"id": "a"}, {"id": "b"}], "relevant": ["a"], "human_review_correct": False}])
        self.assertEqual(report["citation_valid_rate"], 0)
        self.assertEqual(report["expected_source_coverage_mean"], 1)
        self.assertEqual(report["human_review_correct_rate"], 0)
        self.assertNotIn("answer", report["cases"][0])

    def test_reject_duplicate_ids(self):
        case = {"id": "q", "answer": "[1]", "sources": [{"id": "a"}], "relevant": ["a"]}
        with self.assertRaises(ValueError):
            audit_answers([case, case])

    def test_report_cannot_replace_input(self):
        source = Path(__file__).resolve().parents[1] / "data" / f"audit-test-{uuid4().hex}.json"
        source.write_text("input", encoding="utf-8")
        try:
            with self.assertRaises(ValueError):
                write_report(source, {"count": 1}, source)
            self.assertEqual(source.read_text(encoding="utf-8"), "input")
        finally:
            source.unlink()


if __name__ == "__main__":
    unittest.main()
