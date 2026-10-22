"""Index and evaluate an authorized article corpus locally."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
from time import perf_counter

from .core import MODEL, E5Embedder, LegalIndex, build_index, file_sha256
from .answer_audit import audit_answers


def write_report(output: Path, report: dict, input_path: Path) -> None:
    if output.resolve() == input_path.resolve():
        raise ValueError("Le rapport doit être distinct du fichier d'entrée")
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json", prefix="actelyo-report-",
                                     dir=output.parent, delete=False) as temporary:
        temporary.write(json.dumps(report, ensure_ascii=False, indent=2))
        temporary.write("\n")
        staged = Path(temporary.name)
    try:
        os.replace(staged, output)
    finally:
        staged.unlink(missing_ok=True)


def download_model(output: Path) -> dict:
    """Explicit user-initiated fetch; the inference path never uses network."""
    from huggingface_hub import HfApi, snapshot_download
    output = output.resolve()
    if output.exists():
        raise ValueError("Choisissez un nouveau dossier de modèle inexistant")
    output.parent.mkdir(parents=True, exist_ok=True)
    revision = HfApi().model_info(MODEL).sha
    if not isinstance(revision, str) or len(revision) != 40:
        raise ValueError("Révision du modèle E5 invalide")
    stage = Path(tempfile.mkdtemp(prefix="actelyo-e5-", dir=output.parent))
    try:
        snapshot_download(MODEL, revision=revision, local_dir=stage)
        files = {}
        for file in stage.rglob("*"):
            if file.is_file() and ".cache" not in file.parts:
                if not file.resolve().is_relative_to(stage.resolve()):
                    raise ValueError("Le modèle téléchargé contient un lien hors du dossier")
                files[file.relative_to(stage).as_posix()] = file_sha256(file)
        provenance = {"repo_id": MODEL, "revision": revision, "files_sha256": files}
        (stage / "actelyo-model-manifest.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
        os.replace(stage, output)
        return provenance
    finally:
        if stage.exists():
            shutil.rmtree(stage)


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
    def summary(rows):
        count = len(rows)
        latencies = sorted(r["latency_ms"] for r in rows)
        def percentile(value):
            return latencies[min(count - 1, int((count - 1) * value + 0.5))]
        return {"count": count,
                **{f"recall_at_{k}": sum(r[f"relevant_retrieved_at_{k}"] / r["relevant_count"] for r in rows) / count
                   for k in (1, 3, 5)},
                **{f"hit_at_{k}": sum(r["rank"] is not None and r["rank"] <= k for r in rows) / count
                   for k in (1, 3, 5)},
                "mrr": sum(1 / r["rank"] for r in rows if r["rank"]) / count,
                "latency_p50_ms": percentile(0.50), "latency_p95_ms": percentile(0.95)}
    groups = {}
    for result in results:
        groups.setdefault(result["language"] or "unspecified", []).append(result)
    return {**summary(results), "by_language": {name: summary(rows) for name, rows in sorted(groups.items())},
            "cases": [{key: value for key, value in r.items() if key != "retrieved"} for r in results]}


def main() -> None:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    download = commands.add_parser("download-model")
    download.add_argument("--output", type=Path, required=True)
    audit = commands.add_parser("audit-answers")
    audit.add_argument("--input", type=Path, required=True)
    audit.add_argument("--output", type=Path, required=True)
    build = commands.add_parser("index")
    build.add_argument("--corpus", type=Path, required=True)
    build.add_argument("--output", type=Path, required=True)
    benchmark = commands.add_parser("evaluate")
    benchmark.add_argument("--index", type=Path, required=True)
    benchmark.add_argument("--benchmark", type=Path, required=True)
    benchmark.add_argument("--output", type=Path, required=True)
    benchmark.add_argument("--mlflow-local", type=Path, help="Journaliser uniquement dans un dossier MLflow local")
    args = parser.parse_args()
    if args.command == "download-model":
        provenance = download_model(args.output)
        print(f"Modèle {provenance['repo_id']} téléchargé ; révision {provenance['revision']}")
        return
    if args.command == "audit-answers":
        raw = args.input.read_bytes()
        if len(raw) > 50 * 1024 * 1024:
            raise ValueError("Fichier de réponses trop volumineux")
        report = audit_answers(json.loads(raw)["cases"])
        report["input_sha256"] = hashlib.sha256(raw).hexdigest()
        write_report(args.output, report, args.input)
        print(f"{report['count']} réponses auditées ; citations valides {report['citation_valid_rate']:.3f}")
        return
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
        write_report(args.output, report, args.benchmark)
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
