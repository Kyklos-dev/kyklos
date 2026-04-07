"""kyklos/latency-check — measures response latency percentiles from traces."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    max_p95_ms = float(cfg.get("max_p95_ms", 5000))

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return KyklosResult(
            scores={"p50_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0},
            passed=True,
            metadata={"warning": "no outputs to compute latency from"},
            artifacts=[],
            logs=["No outputs — latency check skipped"],
        )

    latencies = sorted(
        float(o.get("latency_ms", 0)) for o in outputs if not o.get("error")
    )
    if not latencies:
        return KyklosResult(
            scores={"p50_ms": 0.0, "p95_ms": 0.0, "p99_ms": 0.0},
            passed=True,
            metadata={"warning": "all outputs had errors, no latency data"},
            artifacts=[],
            logs=["All outputs errored — latency skipped"],
        )

    def percentile(data: list[float], p: float) -> float:
        idx = int(len(data) * p / 100)
        return data[min(idx, len(data) - 1)]

    p50 = percentile(latencies, 50)
    p95 = percentile(latencies, 95)
    p99 = percentile(latencies, 99)
    passed = p95 <= max_p95_ms

    print(f"Latency — p50: {p50:.0f}ms  p95: {p95:.0f}ms  p99: {p99:.0f}ms  limit: {max_p95_ms:.0f}ms")

    return KyklosResult(
        scores={"p50_ms": p50, "p95_ms": p95, "p99_ms": p99},
        passed=passed,
        metadata={"p50_ms": p50, "p95_ms": p95, "p99_ms": p99, "max_p95_ms": max_p95_ms},
        artifacts=[],
        logs=[
            f"p50={p50:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms",
            "PASSED" if passed else f"FAILED: p95 {p95:.0f}ms > limit {max_p95_ms:.0f}ms",
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
