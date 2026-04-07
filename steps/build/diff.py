"""kyklos/diff — compares the current snapshot to the last passing run's snapshot."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, read_json


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config

    # Find current snapshot from previous steps in this run
    current_snapshot: dict = {}
    for stage in ctx.previous_results:
        for step in stage.steps:
            if "snapshot" in step.uses and step.artifact:
                try:
                    current_snapshot = read_json(step.artifact)
                    break
                except Exception:
                    pass

    if not current_snapshot:
        print("WARNING: no snapshot found in previous steps — diff skipped")
        return KyklosResult(
            scores={"changed": 0.0},
            passed=True,
            metadata={"diff_summary": "no snapshot to compare", "changed_fields": []},
            artifacts=[],
            logs=["No snapshot to diff against"],
        )

    # Find baseline snapshot (last passing run's artifact dir)
    # For V1: look for a baseline snapshot in the artifact store
    baseline_dir_root = os.environ.get(
        "KYKLOS_ARTIFACTS_DIR",
        os.path.join(os.path.expanduser("~"), ".kyklos", "artifacts"),
    )

    compare_to = cfg.get("compare_to", "last_passing")
    baseline_snapshot: dict = {}

    if compare_to == "last_passing":
        # Walk artifact dirs ordered newest-first, skip current run
        try:
            runs = sorted(os.listdir(baseline_dir_root), reverse=True)
            for run_dir in runs:
                if run_dir == ctx.run_id:
                    continue
                snap_path = os.path.join(baseline_dir_root, run_dir, "snapshot", "snapshot.json")
                if os.path.exists(snap_path):
                    baseline_snapshot = read_json(snap_path)
                    print(f"Baseline snapshot: {snap_path}")
                    break
        except Exception as e:
            print(f"WARNING: could not load baseline: {e}")

    if not baseline_snapshot:
        print("No baseline snapshot found — this appears to be the first run")
        return KyklosResult(
            scores={"changed": 0.0},
            passed=True,
            metadata={"diff_summary": "no baseline (first run)", "changed_fields": []},
            artifacts=[],
            logs=["No baseline — treating as no diff"],
        )

    # Compute diff
    changed_fields: list[str] = []
    diff_lines: list[str] = []

    for key in ("model", "prompt_hash", "temperature", "max_tokens"):
        cur = current_snapshot.get(key)
        prev = baseline_snapshot.get(key)
        if cur != prev:
            changed_fields.append(key)
            diff_lines.append(f"  {key}: {prev!r} → {cur!r}")

    # Tools diff
    cur_tools = set(current_snapshot.get("tools", []))
    prev_tools = set(baseline_snapshot.get("tools", []))
    if cur_tools != prev_tools:
        added = cur_tools - prev_tools
        removed = prev_tools - cur_tools
        if added:
            changed_fields.append("tools:added")
            diff_lines.append(f"  tools added: {sorted(added)}")
        if removed:
            changed_fields.append("tools:removed")
            diff_lines.append(f"  tools removed: {sorted(removed)}")

    changed = len(changed_fields) > 0
    diff_summary = "\n".join(diff_lines) if diff_lines else "no changes detected"

    print(f"Changed: {changed}")
    if diff_lines:
        for line in diff_lines:
            print(line)

    return KyklosResult(
        scores={"changed": 1.0 if changed else 0.0},
        passed=True,
        metadata={"diff_summary": diff_summary, "changed_fields": changed_fields},
        artifacts=[],
        logs=[diff_summary],
    )


if __name__ == "__main__":
    run_step(run)
