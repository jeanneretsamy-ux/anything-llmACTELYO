"""Optional loopback connector for langflow-ai/openrag's public search API.

No OpenRAG code or document corpus is bundled with Actelyo.
"""
from __future__ import annotations

import hashlib
import os
from urllib.parse import urlparse

import httpx


class OpenRagError(RuntimeError):
    pass


class OpenRagRetriever:
    def __init__(self, base_url: str, api_key: str, filter_id: str):
        base = base_url.rstrip("/")
        parsed = urlparse(base)
        if (parsed.scheme != "http" or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}
                or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
            raise ValueError("OpenRAG doit écouter en HTTP sur ce poste, sans chemin ni identifiants dans l'URL")
        if not api_key or not filter_id:
            raise ValueError("OpenRAG exige ACTELYO_OPENRAG_API_KEY et ACTELYO_OPENRAG_FILTER_ID")
        self.base_url = base
        self.api_key = api_key
        self.filter_id = filter_id

    @classmethod
    def from_environment(cls):
        return cls(os.environ.get("ACTELYO_OPENRAG_URL", "http://127.0.0.1:3000"),
                   os.environ.get("ACTELYO_OPENRAG_API_KEY", ""),
                   os.environ.get("ACTELYO_OPENRAG_FILTER_ID", ""))

    def search(self, query: str, limit: int = 5) -> list[dict]:
        if not query.strip() or len(query) > 4000 or not 1 <= limit <= 20:
            raise ValueError("Recherche invalide")
        try:
            with httpx.Client(timeout=30, follow_redirects=False, trust_env=False) as client:
                response = client.post(f"{self.base_url}/v1/search",
                                       headers={"X-API-Key": self.api_key},
                                       json={"query": query, "limit": limit, "filter_id": self.filter_id})
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise OpenRagError("Recherche OpenRAG indisponible") from exc
        if not isinstance(payload, dict) or not isinstance(payload.get("results"), list):
            raise OpenRagError("Réponse OpenRAG invalide")
        hits = []
        for item in payload["results"][:limit]:
            if not isinstance(item, dict) or not isinstance(item.get("text"), str):
                raise OpenRagError("Résultat OpenRAG invalide")
            filename = item.get("filename") if isinstance(item.get("filename"), str) else "Document OpenRAG"
            page = item.get("page")
            if not isinstance(page, (int, str)) or isinstance(page, bool):
                page = None
            text = item["text"][:8000]
            identifier = hashlib.sha256(f"{filename}\0{page}\0{text}".encode("utf-8")).hexdigest()
            score = item.get("score")
            hits.append({"id": identifier, "citation": f"{filename}, p. {page}" if page is not None else filename,
                         "source_page": page, "text": text, "score": float(score) if isinstance(score, (int, float)) else None,
                         "source_verified": False, "backend": "openrag"})
        return hits
