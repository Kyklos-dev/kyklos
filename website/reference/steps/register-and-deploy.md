# Register & deploy steps

These steps model a lightweight **release line**: tag an artifact, push it to a **registry** (local disk, S3, or GCS), then optionally **deploy**, **canary**, or **health-check** an endpoint. They are optional in a test-and-eval-focused workflow; omit them if you only care about evaluation metrics.

---

## Tag {#step-tag}

**`kyklos/tag`**

Produces a **version label** and manifest for the current run’s artifacts (often used before `kyklos/push`). Default tag can follow `GIT_SHA` from the environment or the run id.

| Option | Default | Description |
|--------|---------|-------------|
| `tag` | derived | Human-readable tag (e.g. `v1.0.0`, `latest`). |

---

## Push {#step-push}

**`kyklos/push`**

Packages artifacts and pushes to a **registry**.

| Option | Default | Description |
|--------|---------|-------------|
| `registry` | `local` | `local` \| `s3` \| `gcs`. |
| `path` | `./registry` or env | Local registry root for `local`. |
| `bucket` | env / config | Bucket name for `s3` / `gcs` (requires cloud SDKs and credentials). |

**Dependencies:** `boto3` for S3, `google-cloud-storage` for GCS.

---

## Deploy endpoint {#step-deploy-endpoint}

**`kyklos/deploy-endpoint`**

Deploys or registers an **inference endpoint** depending on `platform`.

| Option | Default | Description |
|--------|---------|-------------|
| `platform` | `local` | `local` \| `langserve` \| `custom`. |
| `endpoint` | `/agents/default` | Path or logical endpoint name. |
| `langserve_url` | env `LANGSERVE_URL` | Base URL when `platform: langserve`. |
| `script` | _required for `custom`_ | Path to a deploy script for `custom`. |

---

## Canary {#step-canary}

**`kyklos/canary`**

Placeholder-style **canary** configuration for gradual rollout (traffic percentage, duration). Behavior may warn on `local` deployments.

| Option | Default | Description |
|--------|---------|-------------|
| `traffic_percent` | `10` | Initial canary percentage. |
| `duration_minutes` | `30` | Observation window. |
| `on_local` | `warn` | Behavior when not in a real cluster. |

---

## Health check {#step-health-check}

**`kyklos/health-check`**

Sends a **probe** string and checks that the response **contains** expected text within a timeout. Useful after deploy steps.

| Option | Default | Description |
|--------|---------|-------------|
| `probe` | (default phrase) | Message or prompt sent to the endpoint. |
| `expected_contains` | _optional_ | Substring that must appear in the response. |
| `timeout_ms` | `5000` | Max wait time. |
