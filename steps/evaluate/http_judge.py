"""
kyklos/http-judge — POST upstream outputs to an external HTTP endpoint and read a numeric score.

The remote service should return JSON containing a float score (configurable key, default "score").
Use this for custom judges, OpenAI/Anthropic Batch result polling (your service wraps the Batch API),
or any microservice that returns {"score": 0.0–1.0}.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, read_jsonl


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    url = str(cfg.get("url", "")).strip()
    if not url:
        return KyklosResult(
            scores={"score": 0.0},
            passed=False,
            metadata={"error": "with.url is required"},
            artifacts=[],
            logs=["ERROR: with.url missing"],
        )

    method = str(cfg.get("method", "POST")).upper()
    timeout = int(cfg.get("timeout_seconds", 120))
    score_key = str(cfg.get("score_key", "score"))
    pass_threshold = float(cfg.get("pass_threshold", 0.7))

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return KyklosResult(
            scores={"score": 0.0},
            passed=False,
            metadata={"error": "no outputs from upstream"},
            artifacts=[],
            logs=["ERROR: no outputs found from upstream step"],
        )

    extra_headers = cfg.get("headers") or {}
    if not isinstance(extra_headers, dict):
        extra_headers = {}

    payload = {
        "run_id": ctx.run_id,
        "outputs": outputs,
        "stage_config": cfg,
    }

    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", **{str(k): str(v) for k, v in extra_headers.items()}}
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        data = json.loads(raw)
    except urllib.error.HTTPError as e:
        return KyklosResult(
            scores={"score": 0.0},
            passed=False,
            metadata={"error": f"HTTP {e.code}: {e.reason}"},
            artifacts=[],
            logs=[f"ERROR: HTTP {e.code}"],
        )
    except Exception as e:
        return KyklosResult(
            scores={"score": 0.0},
            passed=False,
            metadata={"error": str(e)},
            artifacts=[],
            logs=[f"ERROR: {e}"],
        )

    score = _extract_score(data, score_key)
    score = max(0.0, min(1.0, float(score)))

    return KyklosResult(
        scores={"score": score},
        passed=score >= pass_threshold,
        metadata={"response_keys": list(data.keys()) if isinstance(data, dict) else None},
        artifacts=[],
        logs=[f"http-judge score={score:.4f} (key={score_key!r})"],
    )


def _extract_score(data: object, score_key: str) -> float:
    if isinstance(data, dict):
        if score_key in data:
            return float(data[score_key])
        for k in ("score", "avg_score", "match"):
            if k in data:
                return float(data[k])
    raise ValueError(f"no numeric score in response (tried {score_key!r})")


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        try:
            return read_jsonl(ctx.from_result.artifact)
        except Exception:
            pass
    return []


if __name__ == "__main__":
    run_step(run)
