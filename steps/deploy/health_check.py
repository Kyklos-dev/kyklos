"""kyklos/health-check — sends a probe request to the deployed endpoint."""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, run_agent


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    probe = cfg.get("probe", "hello, are you working?")
    expected_contains = cfg.get("expected_contains", "")
    timeout_ms = int(cfg.get("timeout_ms", 5000))

    agent = ctx.config.get("agent", {})

    print(f"Health check probe: {probe!r}")
    start = time.time() * 1000

    test_case = {"id": "health-probe", "input": probe}
    result = run_agent(agent, test_case, ctx.workspace, ctx.env)

    latency_ms = time.time() * 1000 - start

    if result.get("error"):
        print(f"Health check FAILED: agent error: {result['error']}")
        return KyklosResult(
            scores={"healthy": 0.0, "latency_ms": latency_ms},
            passed=False,
            metadata={"error": result["error"], "latency_ms": latency_ms},
            artifacts=[],
            logs=[f"FAILED: {result['error']}"],
        )

    response = result.get("response", "")

    # Check timeout
    if latency_ms > timeout_ms:
        print(f"Health check FAILED: latency {latency_ms:.0f}ms > limit {timeout_ms}ms")
        return KyklosResult(
            scores={"healthy": 0.0, "latency_ms": latency_ms},
            passed=False,
            metadata={"error": f"timeout: {latency_ms:.0f}ms > {timeout_ms}ms", "response": response},
            artifacts=[],
            logs=[f"FAILED: response too slow ({latency_ms:.0f}ms > {timeout_ms}ms)"],
        )

    # Check expected content
    healthy = True
    if expected_contains and expected_contains.lower() not in response.lower():
        healthy = False
        print(f"Health check FAILED: response does not contain {expected_contains!r}")
        print(f"Got: {response[:200]}")
    else:
        print(f"Health check PASSED in {latency_ms:.0f}ms")

    return KyklosResult(
        scores={"healthy": 1.0 if healthy else 0.0, "latency_ms": latency_ms},
        passed=healthy,
        metadata={"response": response, "latency_ms": latency_ms, "healthy": healthy},
        artifacts=[],
        logs=[
            f"latency={latency_ms:.0f}ms",
            "healthy" if healthy else f"response missing {expected_contains!r}",
        ],
    )


if __name__ == "__main__":
    run_step(run)
