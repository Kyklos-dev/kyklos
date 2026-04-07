#!/usr/bin/env python3
"""POST demo pipelines and trigger runs against the Kyklos repo root (for path resolution).

Usage (server already listening on BASE_URL):
  python3 scripts/seed-demo-data.py

Env:
  BASE_URL   default http://127.0.0.1:8080
  REPO_ROOT  default: parent of scripts/ (repository root)
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8080").rstrip("/")
API = f"{BASE}/api/v1"

HERE = Path(__file__).resolve().parent
REPO_ROOT = Path(os.environ.get("REPO_ROOT", str(HERE.parent))).resolve()
DEMO = HERE / "demo-screenshots"


def read_yaml(name: str) -> str:
    p = DEMO / name
    return p.read_text(encoding="utf-8")


def post_json(path: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read().decode("utf-8")
        if not raw:
            return {}
        return json.loads(raw)


def get_json(path: str) -> dict | list:
    req = urllib.request.Request(f"{API}{path}", method="GET")
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_health(max_wait: float = 30.0) -> None:
    deadline = time.time() + max_wait
    while time.time() < deadline:
        try:
            req = urllib.request.Request(f"{BASE}/health", method="GET")
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    print("health: ok")
                    return
        except (urllib.error.URLError, TimeoutError):
            pass
        time.sleep(0.3)
    print("error: server not reachable at", BASE, file=sys.stderr)
    sys.exit(1)


def main() -> None:
    wait_health()
    print("repo root for workspace_path:", REPO_ROOT)

    pipelines_spec = [
        ("pipeline-fast.yaml", "Agent eval — mock stages"),
        ("pipeline-smoke.yaml", "Smoke — two stages"),
        ("pipeline-gate-fail.yaml", "Gate failure demo"),
    ]

    ids: list[str] = []
    for yaml_name, display_name in pipelines_spec:
        body = {
            "name": display_name,
            "repo_name": "",
            "yaml_path": "kyklos.yaml",
            "yaml": read_yaml(yaml_name),
        }
        out = post_json("/pipelines/", body)
        pid = out.get("id")
        if not pid:
            print("create failed:", out, file=sys.stderr)
            sys.exit(1)
        ids.append(pid)
        print("created pipeline", display_name, pid)

    ws = str(REPO_ROOT)
    trigger_payload = json.dumps({"workspace_path": ws}).encode("utf-8")

    def trigger(pid: str, label: str) -> None:
        req = urllib.request.Request(
            f"{API}/pipelines/{pid}/runs",
            data=trigger_payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            resp.read()
        print("triggered run:", label, pid)

    # Sequential runs so workers don't overlap (clearer for screenshots).
    trigger(ids[0], "fast #1")
    time.sleep(12)
    trigger(ids[0], "fast #2")
    time.sleep(12)
    trigger(ids[1], "smoke")
    time.sleep(5)
    trigger(ids[2], "gate-fail")
    time.sleep(5)

    # Summary
    rows = get_json("/runs")
    if isinstance(rows, list):
        print("total runs in list:", len(rows))
    print("done. Open", BASE, "in the browser.")


if __name__ == "__main__":
    main()
