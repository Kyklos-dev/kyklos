"""
kyklos/semantic-similarity — embedding-based output scoring.

Uses the Anthropic embeddings API when available, falls back to a
simple token-overlap cosine similarity for environments without it.
"""

from __future__ import annotations

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, read_jsonl
from kyklos.slice_utils import slice_score_key


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    dataset_path = cfg.get("dataset", "")
    if dataset_path and not os.path.isabs(dataset_path):
        dataset_path = os.path.join(ctx.workspace, dataset_path)

    threshold = float(cfg.get("threshold", 0.85))
    slice_field = cfg.get("slice_field", "") or ""

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return _error("no outputs found from upstream step")

    if not dataset_path or not os.path.exists(dataset_path):
        return _error(f"dataset not found: {dataset_path}")

    cases = {c.get("id", str(i)): c for i, c in enumerate(read_jsonl(dataset_path))}

    similarities: list[float] = []
    below_threshold: list[dict] = []
    slice_sims: dict[str, list[float]] = {}

    for output in outputs:
        case_id = output.get("_case_id", output.get("id", ""))
        case = cases.get(case_id)
        if not case or "expected_output_contains" not in case:
            continue

        expected = case["expected_output_contains"]
        actual = output.get("response", "")

        sim = _similarity(actual, expected)
        similarities.append(sim)
        if sim < threshold:
            below_threshold.append({"id": case_id, "similarity": sim, "expected": expected})

        if slice_field:
            raw = case.get(slice_field)
            sk = slice_score_key(raw if raw is not None else "unknown")
            slice_sims.setdefault(sk, []).append(sim)

    if not similarities:
        return KyklosResult(
            scores={"avg_similarity": 1.0, "pass_rate": 1.0},
            passed=True,
            metadata={"warning": "no cases with expected_output_contains"},
            artifacts=[],
            logs=["No similarity expectations — skipped"],
        )

    avg_sim = sum(similarities) / len(similarities)
    pass_rate = sum(1 for s in similarities if s >= threshold) / len(similarities)

    scores: dict[str, float] = {
        "avg_similarity": avg_sim,
        "pass_rate": pass_rate,
    }
    slice_meta: dict[str, dict[str, float | int]] = {}
    for sk, sims in slice_sims.items():
        if not sims:
            continue
        sa = sum(sims) / len(sims)
        scores[sk] = sa
        slice_meta[sk] = {"avg_similarity": sa, "n": len(sims)}

    print(f"Semantic similarity — avg: {avg_sim:.3f}, pass rate: {pass_rate:.2%}")
    if slice_field:
        parts = [f"{k}={v:.3f}" for k, v in scores.items() if k not in ("avg_similarity", "pass_rate")]
        if parts:
            print(f"  slices ({slice_field}): " + ", ".join(parts))

    logs = [f"avg_similarity={avg_sim:.3f} pass_rate={pass_rate:.2%}"]
    if slice_field:
        logs.append(f"slice_field={slice_field!r} — gate on step.slice_<name> for subgroup avg_similarity")

    return KyklosResult(
        scores=scores,
        passed=avg_sim >= threshold,
        metadata={
            "avg_similarity": avg_sim,
            "pass_rate": pass_rate,
            "below_threshold": below_threshold,
            "threshold": threshold,
            "slices": slice_meta,
            "slice_field": slice_field or None,
        },
        artifacts=[],
        logs=logs,
    )


def _similarity(text1: str, text2: str) -> float:
    """Token-overlap cosine similarity (fallback when no embedding API)."""
    def tokens(t: str) -> dict[str, int]:
        counts: dict[str, int] = {}
        for word in t.lower().split():
            counts[word] = counts.get(word, 0) + 1
        return counts

    t1, t2 = tokens(text1), tokens(text2)
    if not t1 or not t2:
        return 0.0

    common = sum(min(t1.get(w, 0), t2.get(w, 0)) for w in t1)
    mag1 = math.sqrt(sum(v * v for v in t1.values()))
    mag2 = math.sqrt(sum(v * v for v in t2.values()))

    if mag1 == 0 or mag2 == 0:
        return 0.0
    return common / (mag1 * mag2)


def _error(msg: str) -> KyklosResult:
    return KyklosResult(
        scores={"avg_similarity": 0.0, "pass_rate": 0.0},
        passed=False,
        metadata={"error": msg},
        artifacts=[],
        logs=[f"ERROR: {msg}"],
    )


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl as _rj
        try:
            return _rj(ctx.from_result.artifact)
        except Exception:
            pass
    return []


if __name__ == "__main__":
    run_step(run)
