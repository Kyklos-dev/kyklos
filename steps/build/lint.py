"""kyklos/lint — validates agent config before spending on evaluation."""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step


def run(ctx: KyklosContext) -> KyklosResult:
    agent = ctx.config.get("agent", {})
    errors: list[str] = []

    # Required fields
    if not agent.get("model"):
        errors.append("agent.model is required")
    if not agent.get("prompt"):
        errors.append("agent.prompt is required")

    # Prompt file must exist
    prompt_file = agent.get("prompt", "")
    if prompt_file and not os.path.exists(prompt_file):
        errors.append(f"agent.prompt file not found: {prompt_file}")

    # Model name sanity check
    model = agent.get("model", "")
    known_prefixes = ("claude-", "gpt-", "gemini-", "mistral-")
    if model and not any(model.startswith(p) for p in known_prefixes):
        errors.append(
            f"agent.model {model!r} looks unusual — "
            "expected a known provider prefix (claude-, gpt-, gemini-, mistral-)"
        )

    # Temperature range
    temp = agent.get("temperature", 0.0)
    if not (0.0 <= float(temp) <= 1.0):
        errors.append(f"agent.temperature must be 0.0–1.0, got {temp}")

    # Max tokens
    max_tokens = agent.get("max_tokens", 4096)
    if int(max_tokens) < 1:
        errors.append(f"agent.max_tokens must be >= 1, got {max_tokens}")

    # Runner type
    runner = agent.get("runner", {}) or {}
    runner_type = runner.get("type", "anthropic")
    allowed = ("anthropic", "openai", "gemini", "google", "script")
    if runner_type not in allowed:
        errors.append(
            f"agent.runner.type must be one of {allowed}, got {runner_type!r}"
        )
    if runner_type == "script":
        script = runner.get("script", "")
        if not script:
            errors.append("agent.runner.script is required when type=script")
        elif not os.path.exists(script):
            errors.append(f"agent.runner.script not found: {script}")

    passed = len(errors) == 0

    for e in errors:
        print(f"LINT ERROR: {e}")
    if passed:
        print("Lint passed: agent config is valid")

    return KyklosResult(
        scores={},
        passed=passed,
        metadata={"errors": errors},
        artifacts=[],
        logs=[f"{len(errors)} lint error(s)" if errors else "lint passed"],
    )


if __name__ == "__main__":
    run_step(run)
