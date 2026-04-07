"""
kyklos/regression — compares current scores against the last passing run.

fail_if uses a step-internal DSL (Fix 8 — distinct from engine pass_if):
  "drops > 0.03"    — fails if score dropped by more than 0.03
  "increases > 0.20" — fails if score increased by more than 0.20 (cost guard)
  ">= 0.80"         — absolute threshold (same syntax as engine pass_if)
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    fail_if: dict[str, str] = cfg.get("fail_if", {})

    # Load current scores from previous_results
    current_scores = _collect_scores(ctx.previous_results)
    if not current_scores:
        return KyklosResult(
            scores={},
            passed=True,
            metadata={"warning": "no scores found in previous results"},
            artifacts=[],
            logs=["No previous scores to compare — regression check skipped"],
        )

    # Load baseline scores from artifact store
    baseline_scores = _load_baseline(ctx)

    if not baseline_scores:
        print("No baseline found — this appears to be the first run, regression check skipped")
        return KyklosResult(
            scores={"regressions_found": 0.0},
            passed=True,
            metadata={"warning": "no baseline (first run)", "current_scores": current_scores},
            artifacts=[],
            logs=["No baseline — treating as first run"],
        )

    # Evaluate each fail_if rule
    regressions: list[dict] = []

    for key, rule in fail_if.items():
        # key format: "stage-name.step-name.score-name" or "step-name.score-name"
        current = _lookup_score(current_scores, key)
        baseline = _lookup_score(baseline_scores, key)

        if current is None:
            print(f"WARNING: score {key!r} not found in current results — skipping rule")
            continue

        violated, reason = _evaluate_rule(current, baseline, rule)
        if violated:
            regressions.append({
                "key": key,
                "rule": rule,
                "current": current,
                "baseline": baseline,
                "reason": reason,
            })
            print(f"REGRESSION: {key} — {reason}")
        else:
            print(f"OK: {key} = {current:.4f} (baseline={baseline:.4f if baseline is not None else 'N/A'})")

    # Save current scores as new baseline for next run
    _save_baseline(ctx, current_scores)

    passed = len(regressions) == 0

    return KyklosResult(
        scores={"regressions_found": float(len(regressions))},
        passed=passed,
        metadata={
            "regressions": regressions,
            "current_scores": current_scores,
            "baseline_scores": baseline_scores,
        },
        artifacts=[],
        logs=[
            f"{len(regressions)} regression(s) found" if regressions else "No regressions",
            "PASSED" if passed else f"FAILED: {len(regressions)} regression(s)",
        ],
    )


def _evaluate_rule(current: float, baseline: float | None, rule: str) -> tuple[bool, str]:
    """Evaluate a step-internal fail_if rule (Fix 8: distinct DSL from engine pass_if)."""
    rule = rule.strip()

    if rule.startswith("drops >"):
        threshold = float(rule.split(">", 1)[1].strip())
        if baseline is None:
            return False, "no baseline"
        drop = baseline - current
        if drop > threshold:
            return True, f"dropped {drop:.4f} > {threshold} (from {baseline:.4f} to {current:.4f})"
        return False, f"drop {drop:.4f} ≤ {threshold}"

    if rule.startswith("increases >"):
        threshold = float(rule.split(">", 1)[1].strip())
        if baseline is None:
            return False, "no baseline"
        increase = current - baseline
        if increase > threshold:
            return True, f"increased {increase:.4f} > {threshold} (from {baseline:.4f} to {current:.4f})"
        return False, f"increase {increase:.4f} ≤ {threshold}"

    # Absolute threshold — same syntax as engine pass_if
    for op in (">=", "<=", ">", "<", "=="):
        if rule.startswith(op):
            threshold = float(rule[len(op):].strip())
            passed = _apply_op(op, current, threshold)
            if not passed:
                return True, f"{current:.4f} failed {rule}"
            return False, f"{current:.4f} passed {rule}"

    return False, f"unrecognised rule: {rule!r}"


def _apply_op(op: str, value: float, threshold: float) -> bool:
    return {
        ">=": value >= threshold,
        "<=": value <= threshold,
        ">":  value > threshold,
        "<":  value < threshold,
        "==": value == threshold,
    }.get(op, False)


def _collect_scores(previous_results: list) -> dict[str, float]:
    """Flatten all step scores from previous_results into a dotted key map."""
    scores: dict[str, float] = {}
    for stage in previous_results:
        for step in stage.steps:
            if step.metrics:
                for metric, value in step.metrics.items():
                    scores[f"{stage.stage}.{step.name}.{metric}"] = value
                    scores[f"{step.name}.{metric}"] = value  # short form
    return scores


def _lookup_score(scores: dict[str, float], key: str) -> float | None:
    return scores.get(key)


def _baseline_path(ctx: KyklosContext) -> str:
    base = os.environ.get(
        "KYKLOS_ARTIFACTS_DIR",
        os.path.join(os.path.expanduser("~"), ".kyklos", "artifacts"),
    )
    return os.path.join(base, "regression_baseline.json")


def _load_baseline(ctx: KyklosContext) -> dict[str, float]:
    path = _baseline_path(ctx)
    if not os.path.exists(path):
        return {}
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_baseline(ctx: KyklosContext, scores: dict[str, float]) -> None:
    path = _baseline_path(ctx)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(scores, f, indent=2)


if __name__ == "__main__":
    run_step(run)
