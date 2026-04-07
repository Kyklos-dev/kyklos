"""KyklosResult and emit_result — the output contract every step must fulfil."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

# Module-level guard: emit_result may only be called once per process.
_emitted = False


@dataclass
class KyklosResult:
    """
    The structured result every step must produce.

    Fields
    ------
    scores   : Named numeric values the engine's pass_if gates evaluate against.
               Include at minimum the key(s) referenced in the stage's pass_if block.
    passed   : The step's own top-level judgment. The engine also checks pass_if,
               but this flag is useful for steps that compute a boolean outcome
               (e.g. safety-check, lint).
    metadata : Arbitrary data stored in the DB and shown in the dashboard.
               Never interpreted by the engine.
    artifacts: Paths to files produced by this step (relative to workspace).
               Stored as download links in the dashboard.
    logs     : Additional log lines appended after streaming output.
    """

    scores: dict[str, float] = field(default_factory=dict)
    passed: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)
    artifacts: list[str] = field(default_factory=list)
    logs: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "scores": self.scores,
            "passed": self.passed,
            "metadata": self.metadata,
            "artifacts": self.artifacts,
            "logs": self.logs,
        }


def emit_result(result: KyklosResult) -> None:
    """
    Write the step result to the Kyklos result file descriptor (Fix 4).

    The engine opens a pipe and passes the write end as FD 3 (or the value
    of KYKLOS_RESULT_FD). This function writes exactly one JSON line to that
    descriptor and closes it.

    Must be called exactly once. A second call raises RuntimeError.
    """
    global _emitted
    if _emitted:
        raise RuntimeError(
            "emit_result called twice — a step must emit exactly one result"
        )
    _emitted = True

    fd = int(os.environ.get("KYKLOS_RESULT_FD", "3"))
    payload = json.dumps(result.to_dict()) + "\n"
    try:
        with os.fdopen(fd, "w", closefd=True) as f:
            f.write(payload)
    except OSError as e:
        # FD 3 not available (e.g. running step directly for testing)
        # Fall back to stdout with a sentinel prefix so tests can detect it.
        import sys
        print(f"KYKLOS_RESULT_FALLBACK:{payload}", file=sys.stderr, end="")
        raise RuntimeError(
            f"could not write to result FD {fd}: {e} — "
            "is KYKLOS_RESULT_FD set and the pipe open?"
        ) from e
