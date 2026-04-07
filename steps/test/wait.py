"""kyklos/wait — sleep for testing long-running pipelines (no external I/O)."""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step

# Hard cap so a typo cannot stall workers for hours.
_MAX_SECONDS = 7200.0


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    raw = cfg.get("seconds", 65)
    try:
        seconds = float(raw)
    except (TypeError, ValueError):
        return KyklosResult(
            scores={"waited_seconds": 0.0},
            passed=False,
            metadata={"error": f"invalid seconds: {raw!r}"},
            artifacts=[],
            logs=["ERROR: with.seconds must be a number"],
        )

    seconds = max(0.0, min(seconds, _MAX_SECONDS))
    logs = [f"Waiting {seconds:.1f}s (kyklos/wait)…"]
    print(logs[0], flush=True)

    t0 = time.monotonic()
    time.sleep(seconds)
    elapsed = time.monotonic() - t0

    done_msg = f"Done after {elapsed:.1f}s wall time."
    logs.append(done_msg)
    print(done_msg, flush=True)

    return KyklosResult(
        scores={"waited_seconds": elapsed},
        passed=True,
        metadata={"requested_seconds": seconds, "elapsed_seconds": elapsed},
        artifacts=[],
        logs=logs,
    )


if __name__ == "__main__":
    run_step(run)
