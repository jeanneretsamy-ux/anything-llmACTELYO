import os
import unittest
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient

from legal_rag import api
from legal_rag.openrag import OpenRagError, OpenRagRetriever


class OpenRagTests(unittest.TestCase):
    def test_loopback_key_and_scope_are_required(self):
        for url in ("https://example.com", "http://192.168.1.10:3000", "http://localhost:3000/path",
                    "http://user:pass@localhost:3000"):
            with self.assertRaises(ValueError):
                OpenRagRetriever(url, "secret", "legal")
        with self.assertRaises(ValueError):
            OpenRagRetriever("http://127.0.0.1:3000", "", "legal")
        with self.assertRaises(ValueError):
            OpenRagRetriever("http://127.0.0.1:3000", "secret", "")

    def test_search_sends_scope_and_normalizes_unverified_sources(self):
        def handler(request):
            self.assertEqual(request.url.path, "/v1/search")
            self.assertEqual(request.headers["X-API-Key"], "secret")
            self.assertEqual(request.read(), b'{"query":"capital social","limit":3,"filter_id":"legal"}')
            return httpx.Response(200, json={"results": [{"filename": "statuts.pdf", "text": "Capital de 1000 euros",
                                                           "page": 2, "score": 0.8}]})

        client = httpx.Client(transport=httpx.MockTransport(handler))
        with patch("legal_rag.openrag.httpx.Client", return_value=client):
            hits = OpenRagRetriever("http://127.0.0.1:3000", "secret", "legal").search("capital social", 3)
        self.assertEqual(hits[0]["citation"], "statuts.pdf, p. 2")
        self.assertFalse(hits[0]["source_verified"])
        self.assertEqual(len(hits[0]["id"]), 64)

    def test_invalid_response_fails_closed(self):
        client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"ok": True})))
        with patch("legal_rag.openrag.httpx.Client", return_value=client):
            with self.assertRaises(OpenRagError):
                OpenRagRetriever("http://localhost:3000", "secret", "legal").search("question")

    def test_api_can_select_openrag_without_loading_e5(self):
        environment = {"ACTELYO_LEGAL_RETRIEVER": "openrag", "ACTELYO_OPENRAG_API_KEY": "secret",
                       "ACTELYO_OPENRAG_FILTER_ID": "legal", "ACTELYO_OPENRAG_URL": "http://127.0.0.1:3000"}
        api._openrag = None

    def test_api_reports_unverified_openrag_source_in_local_answer(self):
        environment = {"ACTELYO_LEGAL_RETRIEVER": "openrag", "ACTELYO_OPENRAG_API_KEY": "secret",
                       "ACTELYO_OPENRAG_FILTER_ID": "legal", "ACTELYO_OPENRAG_URL": "http://127.0.0.1:3000"}
        hit = {"id": "doc-1", "citation": "statuts.pdf, p. 2", "source_page": 2,
               "text": "Capital de 1000 euros", "score": 0.8, "source_verified": False}
        api._openrag = None
        with patch.dict(os.environ, environment), patch.object(OpenRagRetriever, "search", return_value=[hit]):
            with patch("httpx.Client") as client_type:
                client = client_type.return_value.__enter__.return_value
                client.post.return_value.json.return_value = {"choices": [{"message": {"content": "Capital [1]."}}]}
                response = TestClient(api.app).post("/answer", json={"query": "capital ?"})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["sources"][0]["source_verified"])
        self.assertTrue(response.json()["has_verifiable_citation"])
        api._openrag = None
        with patch.dict(os.environ, environment), patch.object(OpenRagRetriever, "search", return_value=[]):
            app = TestClient(api.app)
            self.assertEqual(app.get("/health").json()["status"], "configured")
            self.assertEqual(app.post("/search", json={"query": "bonjour"}).json(), {"results": []})
        api._openrag = None


if __name__ == "__main__":
    unittest.main()
