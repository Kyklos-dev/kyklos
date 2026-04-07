"""
kyklos/deploy-endpoint — deploys the agent to a target platform.

V1 platforms:
  local      — writes a deployment manifest and starts a simple HTTP wrapper
  langserve  — deploys to a LangServe instance
  custom     — calls a user-supplied deploy script
"""

from __future__ import annotations

import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, write_json


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    platform = cfg.get("platform", "local")
    endpoint = cfg.get("endpoint", "/agents/default")

    # Find the artifact_uri from the push step
    artifact_uri = ""
    version = ctx.run_id[:8]
    for stage in ctx.previous_results:
        for step in stage.steps:
            if step.uses in ("kyklos/push", "kyklos/tag"):
                if step.metrics:
                    uri = step.metrics.get("artifact_uri")
                    if uri:
                        artifact_uri = str(uri)
                elif hasattr(step, "artifact") and step.artifact:
                    from kyklos.sdk import read_json
                    try:
                        m = read_json(step.artifact)
                        artifact_uri = m.get("artifact_uri", "")
                        version = m.get("version", version)
                    except Exception:
                        pass

    if platform == "local":
        return _deploy_local(ctx, endpoint, artifact_uri, version)
    elif platform == "langserve":
        return _deploy_langserve(ctx, cfg, endpoint, artifact_uri, version)
    elif platform == "custom":
        return _deploy_custom(ctx, cfg, endpoint, artifact_uri, version)
    else:
        return KyklosResult(
            scores={},
            passed=False,
            metadata={"error": f"unknown platform {platform!r}"},
            artifacts=[],
            logs=[f"ERROR: unknown platform {platform!r} — valid: local, langserve, custom"],
        )


def _deploy_local(ctx: KyklosContext, endpoint: str, artifact_uri: str, version: str) -> KyklosResult:
    """Write a deployment record to the local deployment registry."""
    deploy_dir = os.environ.get(
        "KYKLOS_DEPLOY_DIR",
        os.path.join(os.path.expanduser("~"), ".kyklos", "deployments"),
    )
    os.makedirs(deploy_dir, exist_ok=True)

    deploy_record = {
        "endpoint": endpoint,
        "version": version,
        "artifact_uri": artifact_uri,
        "platform": "local",
        "run_id": ctx.run_id,
        "deployed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "active",
    }

    # Write by endpoint slug (replace / with _)
    slug = endpoint.strip("/").replace("/", "_")
    record_path = os.path.join(deploy_dir, f"{slug}.json")
    write_json(record_path, deploy_record)

    endpoint_url = f"http://localhost:8080{endpoint}"
    print(f"Deployed {version} → {endpoint_url} (local)")

    return KyklosResult(
        scores={},
        passed=True,
        metadata={"endpoint_url": endpoint_url, "version": version, "status": "active"},
        artifacts=[record_path],
        logs=[f"Deployed {version} to {endpoint_url}"],
    )


def _deploy_langserve(ctx: KyklosContext, cfg: dict, endpoint: str, artifact_uri: str, version: str) -> KyklosResult:
    langserve_url = cfg.get("langserve_url", os.environ.get("LANGSERVE_URL", ""))
    if not langserve_url:
        return KyklosResult(
            scores={},
            passed=False,
            metadata={"error": "langserve_url required for platform=langserve"},
            artifacts=[],
            logs=["ERROR: set langserve_url in step config or LANGSERVE_URL env var"],
        )
    import urllib.request
    payload = json.dumps({"endpoint": endpoint, "artifact_uri": artifact_uri, "version": version})
    try:
        req = urllib.request.Request(
            f"{langserve_url}/deploy",
            data=payload.encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read())
        endpoint_url = body.get("endpoint_url", f"{langserve_url}{endpoint}")
        print(f"Deployed {version} → {endpoint_url} (langserve)")
        return KyklosResult(
            scores={},
            passed=True,
            metadata={"endpoint_url": endpoint_url, "version": version, "status": "active"},
            artifacts=[],
            logs=[f"Deployed to langserve: {endpoint_url}"],
        )
    except Exception as e:
        return KyklosResult(
            scores={},
            passed=False,
            metadata={"error": str(e)},
            artifacts=[],
            logs=[f"LangServe deploy failed: {e}"],
        )


def _deploy_custom(ctx: KyklosContext, cfg: dict, endpoint: str, artifact_uri: str, version: str) -> KyklosResult:
    script = cfg.get("script", "")
    if not script:
        return KyklosResult(
            scores={}, passed=False,
            metadata={"error": "script required for platform=custom"},
            artifacts=[], logs=["ERROR: script field required for custom platform"],
        )
    import subprocess
    payload = json.dumps({
        "endpoint": endpoint, "artifact_uri": artifact_uri,
        "version": version, "run_id": ctx.run_id,
    })
    try:
        result = subprocess.run(
            [sys.executable, script],
            input=payload.encode(), capture_output=True, timeout=120,
        )
        if result.returncode != 0:
            return KyklosResult(
                scores={}, passed=False,
                metadata={"error": result.stderr.decode()},
                artifacts=[], logs=[f"Deploy script exited {result.returncode}"],
            )
        out = json.loads(result.stdout.decode())
        return KyklosResult(
            scores={},
            passed=True,
            metadata=out,
            artifacts=[],
            logs=[f"Custom deploy succeeded: {out}"],
        )
    except Exception as e:
        return KyklosResult(
            scores={}, passed=False,
            metadata={"error": str(e)},
            artifacts=[], logs=[f"Custom deploy error: {e}"],
        )


if __name__ == "__main__":
    run_step(run)
