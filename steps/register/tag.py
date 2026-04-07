"""kyklos/tag — tags the artifact with git SHA, run ID, and eval scores."""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, write_json


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    tag = cfg.get("tag", ctx.env.get("GIT_SHA", ctx.run_id[:12]))

    # Collect scores from all previous evaluate steps
    scores_snapshot: dict[str, float] = {}
    for stage in ctx.previous_results:
        for step in stage.steps:
            if step.metrics:
                for k, v in step.metrics.items():
                    scores_snapshot[f"{step.name}.{k}"] = v

    # Find the snapshot artifact_id from the build stage
    artifact_id = f"agent-{ctx.run_id[:8]}"
    for stage in ctx.previous_results:
        for step in stage.steps:
            if "snapshot" in step.uses and step.artifact:
                from kyklos.sdk import read_json
                try:
                    snap = read_json(step.artifact)
                    artifact_id = snap.get("artifact_id", artifact_id)
                except Exception:
                    pass

    version = f"{artifact_id}:{tag}"
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    tag_manifest = {
        "version": version,
        "tag": tag,
        "artifact_id": artifact_id,
        "run_id": ctx.run_id,
        "timestamp": timestamp,
        "scores": scores_snapshot,
    }

    out_dir = artifact_dir(ctx.run_id, "tag")
    tag_path = os.path.join(out_dir, "tag.json")
    write_json(tag_path, tag_manifest)

    print(f"Tagged: {version}")
    print(f"Scores: {scores_snapshot}")

    return KyklosResult(
        scores={},
        passed=True,
        metadata=tag_manifest,
        artifacts=[tag_path],
        logs=[f"Tagged artifact {version}"],
    )


if __name__ == "__main__":
    run_step(run)
