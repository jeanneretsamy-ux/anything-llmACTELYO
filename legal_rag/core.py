"""Auditable E5/FAISS index. No corpus or model is downloaded by this module."""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import tempfile
from typing import Any

MODEL = "intfloat/multilingual-e5-base"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def passages(record: dict[str, Any], size: int = 1200, overlap: int = 120) -> list[dict[str, Any]]:
    text = record["text"]
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + size // 2, end)
            if boundary > start:
                end = boundary
        chunks.append({**record, "chunk": len(chunks), "text": f"{record['citation']}\n{text[start:end]}"})
        if end == len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def load_corpus(directory: Path) -> tuple[list[dict[str, Any]], str]:
    directory = directory.resolve(strict=True)
    raw = (directory / "manifest.json").read_bytes()
    manifest = json.loads(raw)
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("articles"), list):
        raise ValueError("Manifest de corpus invalide")
    if len(manifest["articles"]) > 10000:
        raise ValueError("Corpus trop volumineux")
    records = []
    ids = set()
    for item in manifest["articles"]:
        if not isinstance(item, dict) or not isinstance(item.get("id"), str):
            raise ValueError("Article invalide")
        if item["id"] in ids:
            raise ValueError("Identifiant d'article dupliqué")
        ids.add(item["id"])
        if item.get("is_repealed") is not False:
            continue
        rel = item.get("file")
        if not isinstance(rel, str) or not rel.startswith("current/") or "\\" in rel:
            raise ValueError("Chemin d'article invalide")
        file = (directory / rel).resolve(strict=True)
        if not file.is_relative_to(directory / "current") or not file.is_file():
            raise ValueError("Chemin d'article hors corpus")
        data = file.read_bytes()
        if len(data) > 500000 or sha256(data) != item.get("sha256"):
            raise ValueError(f"Empreinte invalide pour {item['id']}")
        text = data.decode("utf-8")
        records.append({"id": item["id"], "citation": item["citation"],
                        "jurisdiction": item["jurisdiction"], "source_page": item.get("source_page"),
                        "text": text, "sha256": item["sha256"]})
    if not records:
        raise ValueError("Aucun article en vigueur dans le corpus")
    return records, sha256(raw)


class E5Embedder:
    def __init__(self, model_path: str = MODEL):
        from sentence_transformers import SentenceTransformer
        self.model_path = model_path
        self.model = SentenceTransformer(model_path, local_files_only=True)

    def encode(self, texts: list[str], kind: str):
        if kind not in ("query", "passage"):
            raise ValueError("Préfixe E5 invalide")
        return self.model.encode([f"{kind}: {text}" for text in texts],
                                 normalize_embeddings=True, convert_to_numpy=True,
                                 show_progress_bar=False)


def build_index(corpus: Path, destination: Path, embedder: E5Embedder) -> dict[str, Any]:
    import faiss
    import numpy as np
    records, corpus_hash = load_corpus(corpus)
    chunks = [chunk for record in records for chunk in passages(record)]
    vectors = np.asarray(embedder.encode([r["text"] for r in chunks], "passage"), dtype="float32")
    if vectors.ndim != 2 or vectors.shape[0] != len(chunks) or not np.isfinite(vectors).all():
        raise ValueError("Embeddings E5 invalides")
    index = faiss.IndexFlatIP(vectors.shape[1])
    index.add(vectors)
    payload = {"schemaVersion": 1, "model": embedder.model_path, "corpusSha256": corpus_hash,
               "count": len(chunks), "articleCount": len(records), "dimension": vectors.shape[1], "articles": chunks}
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="actelyo-index-", dir=destination) as stage:
        stage_path = Path(stage)
        faiss.write_index(index, str(stage_path / "vectors.faiss"))
        payload["vectorsSha256"] = sha256((stage_path / "vectors.faiss").read_bytes())
        (stage_path / "index.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        # Write metadata last so readers see a complete matching pair after a successful build.
        os.replace(stage_path / "vectors.faiss", destination / "vectors.faiss")
        os.replace(stage_path / "index.json", destination / "index.json")
    return payload


class LegalIndex:
    def __init__(self, directory: Path, embedder: E5Embedder):
        import faiss
        self.metadata = json.loads((directory / "index.json").read_text(encoding="utf-8"))
        if self.metadata.get("schemaVersion") != 1 or self.metadata.get("model") != embedder.model_path:
            raise ValueError("Index incompatible avec le modèle E5")
        vectors_path = directory / "vectors.faiss"
        if sha256(vectors_path.read_bytes()) != self.metadata.get("vectorsSha256"):
            raise ValueError("Empreinte de l'index FAISS invalide")
        self.index = faiss.read_index(str(vectors_path))
        if self.index.ntotal != self.metadata["count"] or self.index.d != self.metadata["dimension"]:
            raise ValueError("Index FAISS incohérent")
        self.embedder = embedder

    def search(self, query: str, limit: int = 5) -> list[dict[str, Any]]:
        import numpy as np
        if not query.strip() or len(query) > 4000 or not 1 <= limit <= 20:
            raise ValueError("Recherche invalide")
        vector = np.asarray(self.embedder.encode([query], "query"), dtype="float32")
        scores, positions = self.index.search(vector, min(max(limit * 5, 20), self.index.ntotal))
        found, seen = [], set()
        for score, pos in zip(scores[0], positions[0]):
            if pos < 0:
                continue
            item = self.metadata["articles"][int(pos)]
            if item["id"] in seen:
                continue
            seen.add(item["id"])
            found.append({**item, "score": float(score)})
            if len(found) == limit:
                break
        return found
