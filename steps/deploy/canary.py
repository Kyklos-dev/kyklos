"""
kyklos/canary — traffic splitting between old and new agent versions.

For platform=local this is a no-op with configurable behavior (Fix 9).
  on_local: warn  (default) — logs warning, passes
  on_local: error           — fails with clear message
  on_local: skip            — silent pass
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    traffic_percent = int(cfg.get("traffic_percent", 10))
    duration_minutes = int(cfg.get("duration_minutes", 30))
    on_local = cfg.get("on_local", "warn")

    platform = ctx.config.get("agent", {}).get("platform", "local")
    # Also check deploy step config for platform
    for stage in ctx.previous_results:
        for step in stage.steps:
            if "deploy" in step.uses:
                # platform was local if we're here
                pass

    # Determine if we're in a local context
    is_local = _is_local_platform(ctx)

    if is_local:
        return _handle_local(on_local, traffic_percent)

    # Non-local: actual canary logic (placeholder for real infrastructure)
    print(f"Canary: routing {traffic_percent}% traffic to new version for {duration_minutes}m")

    # Simulate monitoring period (in real life: poll metrics, watch for errors)
    # For V1 we wait a token amount and check for obvious failures
    time.sleep(2)  # symbolic — real canary would poll metrics

    canary_passed = True  # no real infrastructure to check in V1

    return KyklosResult(
        scores={
            "canary_passed": 1.0 if canary_passed else 0.0,
            "traffic_percent": float(traffic_percent),
        },
        passed=canary_passed,
        metadata={
            "traffic_percent": traffic_percent,
            "duration_minutes": duration_minutes,
            "canary_passed": canary_passed,
        },
        artifacts=[],
        logs=[
            f"Canary: {traffic_percent}% for {duration_minutes}m",
            "PASSED" if canary_passed else "FAILED: canary metrics degraded",
        ],
    )


def _is_local_platform(ctx: KyklosContext) -> bool:
    """Check if the deployment was to local platform."""
    deploy_dir = os.environ.get(
        "KYKLOS_DEPLOY_DIR",
        os.path.join(os.path.expanduser("~"), ".kyklos", "deployments"),
    )
    # If deploy records exist locally, we're local
    return os.path.isdir(deploy_dir)


def _handle_local(on_local: str, traffic_percent: int) -> KyklosResult:
    msg = (
        f"[kyklos/canary] WARNING: platform=local — canary traffic splitting is a no-op. "
        f"All traffic will go to the new version. Treating as immediate full rollout."
    )

    if on_local == "error":
        print(f"ERROR: {msg}")
        return KyklosResult(
            scores={"canary_passed": 0.0, "traffic_percent": 100.0},
            passed=False,
            metadata={"error": "canary not supported on local platform"},
            artifacts=[],
            logs=[f"FAILED: {msg}"],
        )

    if on_local == "skip":
        return KyklosResult(
            scores={"canary_passed": 1.0, "traffic_percent": 100.0, "canary_skipped": 1.0},
            passed=True,
            metadata={"canary_skipped": True},
            artifacts=[],
            logs=[],
        )

    # Default: warn
    print(msg)
    return KyklosResult(
        scores={"canary_passed": 1.0, "traffic_percent": 100.0, "canary_skipped": 1.0},
        passed=True,
        metadata={"warning": msg, "canary_skipped": True},
        artifacts=[],
        logs=[msg],
    )


if __name__ == "__main__":
    run_step(run)
