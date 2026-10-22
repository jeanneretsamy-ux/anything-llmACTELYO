"""Index and evaluate an authorized article corpus locally."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from time import perf_counter

from .core import E5Embedder, LegalIndex, build_index


def evaluate(index: LegalIndex, cases: list[dict], top_k: int = 5) -> dict:
    if not cases or len(cases) > 1000:
        raise ValueError("Le benchmark doit contenir entre 1 et 1000 cas")
    results = []
    for case in cases:
        if not isinstance(case.get("query"), str) or not isinstance(case.get("relevant"), list) or not case["relevant"]:
            raise ValueError("Cas de benchmark invalide")
        start = perf_counter()
        found = index.search(case["query"], top_k)
        elapsed = perf_counter() - start
        relevant = set(case["relevant"])
        if not all(isinstance(item, str) and item for item in relevant):
            raise ValueError("Identifiants attendus invalides")
        rank = next((n for n, item in enumerate(found, 1) if item["id"] in relevant), None)
        retrieved = [item["id"] for item in found]
        results.append({"id": case.get("id"), "language": case.get("language"),
                        "rank": rank, "retrieved": retrieved, "relevant_count": len(relevant),
                        "relevant_retrieved_at_1": len(set(retrieved[:1]) & relevant),
                        "relevant_retrieved_at_3": len(set(retrieved[:3]) & relevant),
                        "relevant_retrieved_at_5": len(set(retrieved[:5]) & relevant),
                        "latency_ms": round(elapsed * 1000, 3)})
    count = len(results)
    return {"count": count, "recall_at_1": sum(r["relevant_retrieved_at_1"] / r["relevant_count"] for r in results) / count,
            "recall_at_3": sum(r["relevant_retrieved_at_3"] / r["relevant_count"] for r in results) / count,
            "recall_at_5": sum(r["relevant_retrieved_at_5"] / r["relevant_count"] for r in results) / count,
            "hit_at_1": sum(r["rank"] == 1 for r in results) / count,
            "hit_at_3": sum(r["rank"] is not None and r["rank"] <= 3 for r in results) / count,
            "hit_at_5": sum(r["rank"] is not None and r["rank"] <= 5 for r in results) / count,
            "mrr": sum(1 / r["rank"] for r in results if r["rank"]) / count,
            "cases": [{key: value for key, value in r.items() if key != "retrieved"} for r in results]}


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    build = commands.add_parser("index")
    build.add_argument("--corpus", type=Path, required=True)
    build.add_argument("--output", type=Path, required=True)
    benchmark = commands.add_parser("evaluate")
    benchmark.add_argument("--index", type=Path, required=True)
    benchmark.add_argument("--benchmark", type=Path, required=True)
    benchmark.add_argument("--output", type=Path, required=True)
    benchmark.add_argument("--mlflow-local", type=Path, help="Journaliser uniquement dans un dossier MLflow local")
    args = parser.parse_args()
    embedder = E5Embedder(os.environ.get("ACTELYO_E5_MODEL", "intfloat/multilingual-e5-base"))
    if args.command == "index":
        result = build_index(args.corpus, args.output, embedder)
        print(f"{result['articleCount']} articles et {result['count']} passages indexés ; SHA-256 corpus {result['corpusSha256']}")
    else:
        raw = args.benchmark.read_bytes()
        data = json.loads(raw)
        index = LegalIndex(args.index, embedder)
        report = evaluate(index, data["cases"])
        report.update({"benchmark_sha256": hashlib.sha256(raw).hexdigest(), "model": embedder.model_path})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        if args.mlflow_local:
            import mlflow
            tracking = args.mlflow_local.resolve()
            tracking.mkdir(parents=True, exist_ok=True)
            mlflow.set_tracking_uri(tracking.as_uri())
            mlflow.set_experiment("Actelyo Legal RAG local")
            with mlflow.start_run():
                mlflow.log_params({"model": embedder.model_path, "benchmark_sha256": report["benchmark_sha256"],
                                   "corpus_sha256": index.metadata["corpusSha256"]})
                mlflow.log_metrics({key: report[key] for key in ("recall_at_1", "recall_at_3", "recall_at_5", "mrr")})
        print(f"Recall@5 {report['recall_at_5']:.3f} ; MRR {report['mrr']:.3f}")


if __name__ == "__main__":
    main()
