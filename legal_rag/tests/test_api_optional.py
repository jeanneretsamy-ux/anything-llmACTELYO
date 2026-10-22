"""API contract checks when the small FastAPI dependencies are installed."""
import importlib.util
import os
import unittest
from unittest.mock import patch


class FakeIndex:
    metadata = {"articleCount": 1, "corpusSha256": "a" * 64, "model": "fake"}
    index = type("Faiss", (), {"ntotal": 1})()

    def search(self, query, limit):
        return [{"id": "a", "citation": "Article fictif 1", "source_page": 2,
                 "text": "Texte fictif.", "score": 0.9}]


@unittest.skipUnless(importlib.util.find_spec("fastapi") and importlib.util.find_spec("httpx"),
                     "FastAPI et HTTPX optionnels absents")
class ApiTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from legal_rag import api
        self.api = api
        self.original = api._index
        api._index = FakeIndex()
        self.client = TestClient(api.app)

    def tearDown(self):
        self.api._index = self.original
        self.client.close()

    def test_search_health_and_metrics(self):
        self.assertEqual(self.client.get("/health").json()["articles"], 1)
        response = self.client.post("/search", json={"query": "question", "limit": 5})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["results"][0]["id"], "a")
        self.assertIn("actelyo_legal_search_total", self.client.get("/metrics").text)

    def test_cloud_context_requires_explicit_opt_in(self):
        with patch.dict(os.environ, {"ACTELYO_LEGAL_GENERATOR": "groq"}, clear=True):
            response = self.client.post("/answer", json={"query": "question"})
        self.assertEqual(response.status_code, 403)

    def test_remote_local_llm_url_rejected(self):
        with patch.dict(os.environ, {"ACTELYO_LOCAL_LLM_URL": "https://example.com/v1"}, clear=True):
            response = self.client.post("/answer", json={"query": "question"})
        self.assertEqual(response.status_code, 400)

    def test_local_answer_reports_citation_coverage(self):
        with patch.dict(os.environ, {"ACTELYO_LOCAL_LLM_URL": "http://127.0.0.1:1234/v1"}, clear=True):
            with patch("httpx.Client") as client_type:
                client = client_type.return_value.__enter__.return_value
                client.post.return_value.json.return_value = {"choices": [{"message": {"content": "Réponse fictive [1]."}}]}
                response = self.client.post("/answer", json={"query": "question"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["has_verifiable_citation"])
        self.assertEqual(response.json()["sources"][0]["source_page"], 2)
        self.assertFalse(response.json()["sources"][0]["source_verified"])


if __name__ == "__main__":
    unittest.main()
