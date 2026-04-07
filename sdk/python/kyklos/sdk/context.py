"""KyklosContext — the input contract every step receives via JSON on stdin."""

from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from typing import Any


# ── Step-result summary types (Fix 7: typed schema for previous_results) ──────

@dataclass
class StepResultSummary:
    name: str
    uses: str
    status: str                           # "passed" | "failed" | "skipped"
    score: float | None = None            # primary numeric score
    metrics: dict[str, float] | None = None  # all named scores
    artifact: str | None = None           # primary artifact path

    @classmethod
    def from_dict(cls, d: dict) -> StepResultSummary:
        return cls(
            name=d.get("name", ""),
            uses=d.get("uses", ""),
            status=d.get("status", "unknown"),
            score=d.get("score"),
            metrics=d.get("metrics"),
            artifact=d.get("artifact"),
        )


@dataclass
class StageResultSummary:
    stage: str
    iteration: int
    total_iterations: int
    status: str                           # "passed" | "failed" | "skipped"
    started_at: str                       # ISO 8601
    finished_at: str                      # ISO 8601
    duration_seconds: float
    steps: list[StepResultSummary] = field(default_factory=list)

    @classmethod
    def from_dict(cls, d: dict) -> StageResultSummary:
        return cls(
            stage=d.get("stage", ""),
            iteration=d.get("iteration", 1),
            total_iterations=d.get("total_iterations", 1),
            status=d.get("status", "unknown"),
            started_at=d.get("started_at", ""),
            finished_at=d.get("finished_at", ""),
            duration_seconds=d.get("duration_seconds", 0.0),
            steps=[StepResultSummary.from_dict(s) for s in d.get("steps", [])],
        )

    def get_step(self, name: str) -> StepResultSummary | None:
        """Find a step by name within this stage."""
        return next((s for s in self.steps if s.name == name), None)


# ── KyklosContext ──────────────────────────────────────────────────────────────

@dataclass
class KyklosContext:
    """
    The full execution context passed to every step.

    Fields
    ------
    run_id          : Unique identifier for the current pipeline run.
    workspace       : Absolute path to the checked-out agent repo on disk.
    config          : Full parsed kyklos.yaml as a dict.
    stage_config    : The 'with:' block for this specific step invocation.
    previous_results: Latest iteration of each stage that has run so far.
                      Use this for almost all cases.
    all_results     : Full iteration history per stage name.
                      Only needed when comparing across goto loops.
    from_result     : Pre-resolved result of the step named in 'with.from'.
                      None if 'from' was not set or the step was not found.
    env             : Resolved environment variables from the pipeline env block.
    kyklos_version  : Version string of the Kyklos server.
    """

    run_id: str
    workspace: str
    config: dict[str, Any]
    stage_config: dict[str, Any]
    previous_results: list[StageResultSummary]
    all_results: dict[str, list[StageResultSummary]]
    from_result: StepResultSummary | None
    env: dict[str, str]
    kyklos_version: str = "0.1.0"

    @classmethod
    def from_dict(cls, d: dict) -> KyklosContext:
        # Go json.Marshal emits null for nil slices; dict.get("k", default) still
        # returns None when the key exists with JSON null.
        prev_raw = d.get("previous_results") or []
        prev = [StageResultSummary.from_dict(s) for s in prev_raw]
        all_raw = d.get("all_results") or {}
        all_r: dict[str, list[StageResultSummary]] = {
            k: [StageResultSummary.from_dict(s) for s in (v or [])]
            for k, v in all_raw.items()
        }
        fr_raw = d.get("from_result")
        fr = StepResultSummary.from_dict(fr_raw) if fr_raw else None
        return cls(
            run_id=d.get("run_id", ""),
            workspace=d.get("workspace", ""),
            config=d.get("config") or {},
            stage_config=d.get("stage_config") or {},
            previous_results=prev,
            all_results=all_r,
            from_result=fr,
            env=d.get("env") or {},
            kyklos_version=d.get("kyklos_version", "0.1.0"),
        )

    @classmethod
    def from_stdin(cls) -> KyklosContext:
        """Read the context JSON from stdin. Called automatically by run_step()."""
        raw = sys.stdin.read()
        return cls.from_dict(json.loads(raw))

    # ── Convenience helpers ───────────────────────────────────────────────────

    def get_stage(self, stage_name: str) -> StageResultSummary | None:
        """Return the latest result for the named stage, or None."""
        return next((s for s in self.previous_results if s.stage == stage_name), None)

    def get_step_result(self, stage_name: str, step_name: str) -> StepResultSummary | None:
        """Return a specific step result from a prior stage."""
        stage = self.get_stage(stage_name)
        if stage is None:
            return None
        return stage.get_step(step_name)
