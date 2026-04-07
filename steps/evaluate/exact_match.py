"""kyklos/exact-match — deterministic scoring for structured outputs."""

from __future__ import annotations

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

    field = cfg.get("field", "intent")
    slice_field = cfg.get("slice_field", "") or ""

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return _error("no outputs found from upstream step")

    if not dataset_path or not os.path.exists(dataset_path):
        return _error(f"dataset not found: {dataset_path}")

    cases = {c.get("id", str(i)): c for i, c in enumerate(read_jsonl(dataset_path))}

    correct = 0
    total = 0
    mismatches: list[dict] = []
    # Per-slice counts for gate pass_if (e.g. exact-match.slice_eu >= 0.9)
    slice_totals: dict[str, dict[str, int]] = {}

    for output in outputs:
        case_id = output.get("_case_id", output.get("id", ""))
        case = cases.get(case_id)
        if not case or f"expected_{field}" not in case:
            continue

        expected = str(case[f"expected_{field}"])
        actual = str(output.get(field, output.get("response", "")))

        total += 1
        ok = actual.strip().lower() == expected.strip().lower()
        if ok:
            correct += 1
        else:
            mismatches.append({"id": case_id, "expected": expected, "got": actual})

        if slice_field:
            raw = case.get(slice_field)
            sk = slice_score_key(raw if raw is not None else "unknown")
            if sk not in slice_totals:
                slice_totals[sk] = {"correct": 0, "total": 0}
            slice_totals[sk]["total"] += 1
            if ok:
                slice_totals[sk]["correct"] += 1

    if total == 0:
        return KyklosResult(
            scores={"accuracy": 1.0},
            passed=True,
            metadata={"warning": f"no cases with expected_{field} field"},
            artifacts=[],
            logs=[f"No expected_{field} fields — skipped"],
        )

    accuracy = correct / total
    scores: dict[str, float] = {"accuracy": accuracy}
    slice_meta: dict[str, dict[str, float | int]] = {}
    for sk, st in slice_totals.items():
        t = st["total"]
        acc = st["correct"] / t if t else 0.0
        scores[sk] = acc
        slice_meta[sk] = {"accuracy": acc, "n": t}

    print(f"Exact match accuracy ({field}): {accuracy:.2%} ({correct}/{total})")
    if slice_field:
        print(f"  slices ({slice_field}): " + ", ".join(f"{k}={v:.2%}" for k, v in scores.items() if k != "accuracy"))

    logs = [f"accuracy={accuracy:.2%} field={field}"]
    if slice_field:
        logs.append(f"slice_field={slice_field!r} — use pass_if on step.slice_<name> scores")

    return KyklosResult(
        scores=scores,
        passed=accuracy >= 0.80,
        metadata={
            "total": total,
            "correct": correct,
            "mismatches": mismatches,
            "slices": slice_meta,
            "slice_field": slice_field or None,
        },
        artifacts=[],
        logs=logs,
    )


def _error(msg: str) -> KyklosResult:
    return KyklosResult(
        scores={"accuracy": 0.0},
        passed=False,
        metadata={"error": msg},
        artifacts=[],
        logs=[f"ERROR: {msg}"],
    )


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl
        try:
            return read_jsonl(ctx.from_result.artifact)
        except Exception:
            pass
    return []


if __name__ == "__main__":
    run_step(run)
