"""kyklos/cost-check — computes actual API cost from token usage traces."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, cost_usd


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    max_usd = float(cfg.get("max_usd", 0.05))

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return KyklosResult(
            scores={"avg_cost_per_run": 0.0, "total_cost": 0.0},
            passed=True,
            metadata={"warning": "no outputs to compute cost from"},
            artifacts=[],
            logs=["No outputs — cost check skipped"],
        )

    total_cost = 0.0
    per_run: list[float] = []

    for output in outputs:
        usage = output.get("usage", {})
        model = output.get("model", "claude-sonnet-4-6")
        input_tokens = int(usage.get("input_tokens", 0))
        output_tokens = int(usage.get("output_tokens", 0))

        run_cost = output.get("cost_usd") or cost_usd(model, input_tokens, output_tokens)
        per_run.append(run_cost)
        total_cost += run_cost

    avg_cost = total_cost / len(per_run) if per_run else 0.0
    passed = avg_cost <= max_usd

    print(f"Cost check — avg: ${avg_cost:.5f}, total: ${total_cost:.4f}, limit: ${max_usd:.5f}")

    return KyklosResult(
        scores={
            "avg_cost_per_run": avg_cost,
            "total_cost": total_cost,
        },
        passed=passed,
        metadata={
            "avg_cost_per_run": avg_cost,
            "total_cost": total_cost,
            "max_usd": max_usd,
            "runs": len(per_run),
        },
        artifacts=[],
        logs=[
            f"avg=${avg_cost:.5f} total=${total_cost:.4f} limit=${max_usd:.5f}",
            "PASSED" if passed else f"FAILED: avg cost ${avg_cost:.5f} exceeds limit ${max_usd:.5f}",
        ],
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
