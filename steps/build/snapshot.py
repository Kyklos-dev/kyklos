"""kyklos/snapshot — captures the current agent state as a versioned artifact."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, write_json


def run(ctx: KyklosContext) -> KyklosResult:
    agent = ctx.config.get("agent", {})
    model = agent.get("model", "")
    prompt_file = agent.get("prompt", "")
    tools = agent.get("tools", [])
    temperature = agent.get("temperature", 0.0)
    max_tokens = agent.get("max_tokens", 4096)

    # Read prompt content for hashing
    prompt_content = ""
    if prompt_file and os.path.exists(prompt_file):
        with open(prompt_file) as f:
            prompt_content = f.read()
        print(f"Loaded prompt: {prompt_file} ({len(prompt_content)} chars)")
    elif prompt_file:
        print(f"WARNING: prompt file not found: {prompt_file}")

    # Compute stable hash over the agent definition
    h = hashlib.sha256()
    h.update(json.dumps({
        "model": model,
        "prompt": prompt_content,
        "tools": sorted(tools),
        "temperature": temperature,
        "max_tokens": max_tokens,
    }, sort_keys=True).encode())
    prompt_hash = h.hexdigest()[:16]

    artifact_id = f"snap-{ctx.run_id[:8]}-{prompt_hash[:8]}"
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    snapshot = {
        "artifact_id": artifact_id,
        "run_id": ctx.run_id,
        "prompt_hash": prompt_hash,
        "model": model,
        "tools": tools,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "timestamp": timestamp,
    }

    out_dir = artifact_dir(ctx.run_id, "snapshot")
    snapshot_path = os.path.join(out_dir, "snapshot.json")
    write_json(snapshot_path, snapshot)

    print(f"Snapshot created: {artifact_id}")
    print(f"Prompt hash: {prompt_hash}")
    print(f"Model: {model}")

    return KyklosResult(
        scores={},
        passed=True,
        metadata=snapshot,
        artifacts=[snapshot_path],
        logs=[f"Snapshot {artifact_id} created"],
    )


if __name__ == "__main__":
    run_step(run)
