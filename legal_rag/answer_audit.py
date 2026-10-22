"""Offline citation audit of recorded answers; legal correctness still needs a human."""
from __future__ import annotations

import re


def audit_answers(cases: list[dict]) -> dict:
    if not isinstance(cases, list) or not 1 <= len(cases) <= 1000:
        raise ValueError("Entre 1 et 1000 réponses sont attendues")
    checked = []
    seen = set()
    for case in cases:
        if not isinstance(case, dict) or not isinstance(case.get("id"), str) or case["id"] in seen:
            raise ValueError("Identifiant de réponse manquant ou dupliqué")
        seen.add(case["id"])
        answer = case.get("answer")
        sources = case.get("sources")
        relevant = case.get("relevant")
        if not isinstance(answer, str) or len(answer) > 100000 or not isinstance(sources, list) or not isinstance(relevant, list):
            raise ValueError("Réponse ou sources invalides")
        source_ids = [s.get("id") if isinstance(s, dict) else None for s in sources]
        if not source_ids or not all(isinstance(i, str) and i for i in source_ids) or len(set(source_ids)) != len(source_ids):
            raise ValueError("Sources citées invalides")
        if not relevant or not all(isinstance(i, str) and i for i in relevant):
            raise ValueError("Jugement de pertinence invalide")
        numbers = [int(n) for n in re.findall(r"\[(\d+)\]", answer)]
        valid_numbers = {n for n in numbers if 1 <= n <= len(source_ids)}
        cited_ids = {source_ids[n - 1] for n in valid_numbers}
        expected = set(relevant)
        review = case.get("human_review_correct")
        if review is not None and not isinstance(review, bool):
            raise ValueError("La revue humaine doit être true, false ou absente")
        checked.append({"id": case["id"], "citations_present": bool(numbers),
                        "citations_valid": bool(numbers) and len(valid_numbers) == len(set(numbers)),
                        "citation_precision": len(cited_ids & expected) / len(cited_ids) if cited_ids else 0,
                        "expected_source_coverage": len(cited_ids & expected) / len(expected),
                        "human_review_correct": review})
    reviewed = [r["human_review_correct"] for r in checked if r["human_review_correct"] is not None]
    return {"count": len(checked),
            "citation_valid_rate": sum(r["citations_valid"] for r in checked) / len(checked),
            "citation_precision_mean": sum(r["citation_precision"] for r in checked) / len(checked),
            "expected_source_coverage_mean": sum(r["expected_source_coverage"] for r in checked) / len(checked),
            "human_review_count": len(reviewed),
            "human_review_correct_rate": sum(reviewed) / len(reviewed) if reviewed else None,
            "cases": checked}
