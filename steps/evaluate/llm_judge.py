"""
kyklos/llm-judge — scores agent outputs using an LLM against a rubric.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, write_jsonl


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config

    model = cfg.get("model", "claude-sonnet-4-6")
    rubric_path = cfg.get("rubric", "")
    if rubric_path and not os.path.isabs(rubric_path):
        rubric_path = os.path.join(ctx.workspace, rubric_path)

    outputs = _resolve_outputs(ctx, cfg.get("from", "run-dataset"))
    if not outputs:
        return KyklosResult(
            scores={"score": 0.0, "pass_rate": 0.0},
            passed=False,
            metadata={"error": "no outputs to evaluate"},
            artifacts=[],
            logs=["ERROR: no outputs found from upstream step"],
        )

    rubric = ""
    if rubric_path and os.path.exists(rubric_path):
        with open(rubric_path) as f:
            rubric = f.read()
    else:
        rubric = _default_rubric()

    try:
        import anthropic
    except ImportError:
        return KyklosResult(
            scores={"score": 0.0, "pass_rate": 0.0},
            passed=False,
            metadata={"error": "anthropic package not installed"},
            artifacts=[],
            logs=["ERROR: pip install anthropic"],
        )

    client = anthropic.Anthropic()
    scores: list[float] = []
    judgements: list[dict] = []
    failure_reasons: list[str] = []

    for i, output in enumerate(outputs):
        if output.get("error"):
            scores.append(0.0)
            failure_reasons.append(f"case {output.get('id', i)}: agent error")
            continue

        prompt = f"""You are an evaluator. Score the following agent response using the rubric below.

## Rubric
{rubric}

## Agent Input
{output.get("input", "")}

## Agent Response
{output.get("response", "")}

Respond ONLY with valid JSON in this exact format:
{{"score": <float 0.0-1.0>, "reason": "<brief explanation>"}}"""

        try:
            resp = client.messages.create(
                model=model,
                max_tokens=256,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = resp.content[0].text.strip()
            # Extract JSON even if wrapped in markdown
            if "```" in raw:
                raw = raw.split("```")[1].lstrip("json").strip()
            judgement = json.loads(raw)
            score = float(judgement.get("score", 0.0))
            scores.append(max(0.0, min(1.0, score)))
            judgements.append({
                "id": output.get("id", str(i)),
                "score": score,
                "reason": judgement.get("reason", ""),
            })
        except Exception as e:
            scores.append(0.0)
            failure_reasons.append(f"case {i}: judge error: {e}")

        if (i + 1) % 10 == 0:
            print(f"Judged {i + 1}/{len(outputs)}")

    avg_score = sum(scores) / len(scores) if scores else 0.0
    pass_rate = sum(1 for s in scores if s >= 0.7) / len(scores) if scores else 0.0

    out_dir = artifact_dir(ctx.run_id, "llm-judge")
    judgements_path = os.path.join(out_dir, "judgements.jsonl")
    write_jsonl(judgements_path, judgements)

    print(f"LLM Judge — avg score: {avg_score:.3f}, pass rate: {pass_rate:.2%}")

    return KyklosResult(
        scores={"score": avg_score, "pass_rate": pass_rate},
        passed=avg_score >= 0.70,
        metadata={
            "avg_score": avg_score,
            "pass_rate": pass_rate,
            "failure_reasons": failure_reasons,
            "judged": len(scores),
        },
        artifacts=[judgements_path],
        logs=[f"avg_score={avg_score:.3f} pass_rate={pass_rate:.2%}"],
    )


def _default_rubric() -> str:
    return """Score each response 0.0 to 1.0 on:
- Accuracy: Does it correctly address the input?
- Helpfulness: Does it actually help the user?
- Clarity: Is the response clear and well-structured?

Return JSON: {"score": float, "reason": string}"""


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl
        try:
            return read_jsonl(ctx.from_result.artifact)
        except Exception:
            pass
    # Fallback: scan previous_results metadata
    for stage in ctx.previous_results:
        for step in stage.steps:
            if from_ref.split(".")[-1] in (step.name, step.uses):
                if hasattr(step, "metadata") and step.metadata:
                    outputs = step.metadata.get("outputs", [])
                    if outputs:
                        return outputs
    return []


if __name__ == "__main__":
    run_step(run)
