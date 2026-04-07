"""Artifact path helpers used by built-in steps."""

from __future__ import annotations

import json
import os
from typing import Any


def artifact_dir(run_id: str, step_name: str) -> str:
    """
    Returns (and creates) the artifact directory for this run + step.

    Priority:
      1. KYKLOS_ARTIFACTS_DIR env var (set by the engine)
      2. ~/.kyklos/artifacts  (fallback for local dev)
    """
    base = os.environ.get(
        "KYKLOS_ARTIFACTS_DIR",
        os.path.join(os.path.expanduser("~"), ".kyklos", "artifacts"),
    )
    path = os.path.join(base, run_id, step_name)
    os.makedirs(path, exist_ok=True)
    return path


def write_jsonl(path: str, records: list[dict]) -> None:
    """Write a list of dicts to a JSONL file."""
    with open(path, "w") as f:
        for r in records:
            f.write(json.dumps(r) + "\n")


def read_jsonl(path: str) -> list[dict]:
    """Read a JSONL file into a list of dicts."""
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def write_json(path: str, data: Any) -> None:
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def read_json(path: str) -> Any:
    with open(path) as f:
        return json.load(f)
