"""
kyklos/push — pushes the tagged artifact to a registry.

V1 supports:
  registry: local  — copies artifacts to a local directory
  registry: s3     — uploads to S3 (requires boto3 + AWS credentials)
  registry: gcs    — uploads to GCS (requires google-cloud-storage)
"""

from __future__ import annotations

import os
import shutil
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, read_json, write_json


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    registry = cfg.get("registry", "local")
    local_path = cfg.get("path", os.environ.get("KYKLOS_REGISTRY_DIR", "./registry"))

    if local_path and not os.path.isabs(local_path):
        local_path = os.path.join(ctx.workspace, local_path)

    # Load tag manifest from register/tag step
    tag_manifest: dict = {}
    for stage in ctx.previous_results:
        for step in stage.steps:
            if step.uses == "kyklos/tag" and step.artifact:
                try:
                    tag_manifest = read_json(step.artifact)
                    break
                except Exception:
                    pass

    version = tag_manifest.get("version", f"agent:{ctx.run_id[:8]}")
    artifact_id = tag_manifest.get("artifact_id", ctx.run_id[:8])

    # Build the artifact package — collect all artifacts from this run
    out_dir = artifact_dir(ctx.run_id, "push")
    package_dir = os.path.join(out_dir, artifact_id)
    os.makedirs(package_dir, exist_ok=True)

    # Write manifest
    manifest = {
        "version": version,
        "artifact_id": artifact_id,
        "run_id": ctx.run_id,
        "pushed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "scores": tag_manifest.get("scores", {}),
    }
    manifest_path = os.path.join(package_dir, "manifest.json")
    write_json(manifest_path, manifest)

    artifact_uri = ""

    if registry == "local":
        dest = os.path.join(local_path, artifact_id)
        os.makedirs(dest, exist_ok=True)
        shutil.copy2(manifest_path, os.path.join(dest, "manifest.json"))
        artifact_uri = f"file://{dest}"
        print(f"Pushed to local registry: {dest}")

    elif registry == "s3":
        bucket = cfg.get("bucket", os.environ.get("KYKLOS_S3_BUCKET", ""))
        if not bucket:
            return _error("s3 registry requires bucket config or KYKLOS_S3_BUCKET env var")
        try:
            import boto3
            s3 = boto3.client("s3")
            key = f"{artifact_id}/manifest.json"
            s3.upload_file(manifest_path, bucket, key)
            artifact_uri = f"s3://{bucket}/{artifact_id}"
            print(f"Pushed to S3: {artifact_uri}")
        except ImportError:
            return _error("s3 registry requires boto3: pip install boto3")
        except Exception as e:
            return _error(f"S3 upload failed: {e}")

    elif registry == "gcs":
        bucket = cfg.get("bucket", os.environ.get("KYKLOS_GCS_BUCKET", ""))
        if not bucket:
            return _error("gcs registry requires bucket config or KYKLOS_GCS_BUCKET env var")
        try:
            from google.cloud import storage
            client = storage.Client()
            blob = client.bucket(bucket).blob(f"{artifact_id}/manifest.json")
            blob.upload_from_filename(manifest_path)
            artifact_uri = f"gs://{bucket}/{artifact_id}"
            print(f"Pushed to GCS: {artifact_uri}")
        except ImportError:
            return _error("gcs registry requires google-cloud-storage: pip install google-cloud-storage")
        except Exception as e:
            return _error(f"GCS upload failed: {e}")

    else:
        return _error(f"unknown registry {registry!r} — valid: local, s3, gcs")

    return KyklosResult(
        scores={},
        passed=True,
        metadata={"artifact_uri": artifact_uri, "version": version},
        artifacts=[manifest_path],
        logs=[f"Pushed {version} → {artifact_uri}"],
    )


def _error(msg: str) -> KyklosResult:
    return KyklosResult(
        scores={},
        passed=False,
        metadata={"error": msg},
        artifacts=[],
        logs=[f"ERROR: {msg}"],
    )


if __name__ == "__main__":
    run_step(run)
