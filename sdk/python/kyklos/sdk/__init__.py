"""kyklos.sdk — public API for step authors."""

from __future__ import annotations

from .context import KyklosContext, StageResultSummary, StepResultSummary
from .result import KyklosResult, emit_result
from .artifacts import artifact_dir, read_jsonl, write_jsonl, read_json, write_json
from .agent import run_agent, cost_usd


def run_step(fn) -> None:
    """
    Entry-point wrapper for every step file.

    Reads KyklosContext from stdin, calls fn(ctx), emits the returned
    KyklosResult to FD 3.  Steps must end with:

        if __name__ == "__main__":
            from kyklos.sdk import run_step
            run_step(run)
    """
    ctx = KyklosContext.from_stdin()
    result = fn(ctx)
    if result is None:
        raise RuntimeError(
            f"step function {fn.__name__!r} returned None — "
            "it must return a KyklosResult"
        )
    emit_result(result)


__all__ = [
    "KyklosContext",
    "KyklosResult",
    "StageResultSummary",
    "StepResultSummary",
    "emit_result",
    "run_step",
    "artifact_dir",
    "read_jsonl",
    "write_jsonl",
    "read_json",
    "write_json",
    "run_agent",
    "cost_usd",
]
