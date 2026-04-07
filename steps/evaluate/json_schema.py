"""kyklos/json-schema — validate each upstream JSONL row against a JSON Schema file."""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step

try:
    import jsonschema
except ImportError:  # pragma: no cover - Makefile setup installs jsonschema
    jsonschema = None  # type: ignore[assignment]


def run(ctx: KyklosContext) -> KyklosResult:
    if jsonschema is None:
        return KyklosResult(
            scores={"valid_ratio": 0.0},
            passed=False,
            metadata={"error": "jsonschema not installed"},
            artifacts=[],
            logs=["ERROR: pip install jsonschema (see Makefile setup)"],
        )

    cfg = ctx.stage_config
    schema_path = cfg.get("schema", "")
    if not schema_path:
        return _error("with.schema is required (path to JSON Schema under the workspace)")
    if not os.path.isabs(schema_path):
        schema_path = os.path.join(ctx.workspace, schema_path)
    if not os.path.isfile(schema_path):
        return _error(f"schema file not found: {schema_path}")

    with open(schema_path, encoding="utf-8") as f:
        schema = json.load(f)

    field = cfg.get("field")  # optional: validate this key only (or JSON-parse if str)

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return KyklosResult(
            scores={"valid_ratio": 1.0},
            passed=True,
            metadata={"warning": "no outputs to validate"},
            artifacts=[],
            logs=["No upstream outputs — skipped"],
        )

    validator = jsonschema.validators.validator_for(schema)
    validator.check_schema(schema)
    v = validator(schema)

    errors: list[str] = []
    ok = 0
    for i, row in enumerate(outputs):
        inst = _instance(row, field)
        if inst is _SKIP:
            continue
        try:
            v.validate(inst)
            ok += 1
        except jsonschema.ValidationError as e:
            errors.append(f"row {i}: {e.message}")

    checked = ok + len(errors)
    if checked == 0:
        return KyklosResult(
            scores={"valid_ratio": 1.0},
            passed=True,
            metadata={"warning": "no rows contained data to validate"},
            artifacts=[],
            logs=["Nothing to validate — skipped"],
        )

    ratio = ok / checked
    passed = len(errors) == 0
    print(f"JSON schema: {ok}/{checked} rows valid ({schema_path})")

    return KyklosResult(
        scores={"valid_ratio": ratio, "valid_rows": float(ok), "checked_rows": float(checked)},
        passed=passed,
        metadata={"schema": schema_path, "errors": errors[:50], "field": field},
        artifacts=[],
        logs=[f"valid_ratio={ratio:.3f}"] + (errors[:20] if errors else ["OK"]),
    )


class _Skip:
    pass


_SKIP = _Skip()


def _instance(row: dict, field: str | None) -> object | _Skip:
    if not field:
        return row
    raw = row.get(field)
    if raw is None:
        return _SKIP
    if isinstance(raw, (dict, list)):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return raw
    return raw


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl

        try:
            return read_jsonl(ctx.from_result.artifact)
        except Exception:
            pass
    return []


def _error(msg: str) -> KyklosResult:
    return KyklosResult(
        scores={"valid_ratio": 0.0},
        passed=False,
        metadata={"error": msg},
        artifacts=[],
        logs=[f"ERROR: {msg}"],
    )


if __name__ == "__main__":
    run_step(run)
