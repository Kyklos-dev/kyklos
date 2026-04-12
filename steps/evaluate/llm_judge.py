"""
kyklos/llm-judge — scores agent outputs using DeepEval (G-Eval) + LiteLLM against a rubric.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))
sys.path.insert(0, os.path.dirname(__file__))

from deepeval_utils import build_litellm_model, resolve_litellm_model_id

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, write_jsonl


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    threshold = float(cfg.get("threshold", 0.7))

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

    try:
        from deepeval.metrics import GEval
        from deepeval.test_case import LLMTestCase, LLMTestCaseParams
    except ImportError:
        return KyklosResult(
            scores={"score": 0.0, "pass_rate": 0.0},
            passed=False,
            metadata={"error": "deepeval package not installed"},
            artifacts=[],
            logs=["ERROR: pip install deepeval litellm (see Makefile setup)"],
        )

    rubric = ""
    if rubric_path and os.path.exists(rubric_path):
        with open(rubric_path, encoding="utf-8") as f:
            rubric = f.read()
    else:
        rubric = _default_rubric()

    try:
        litellm_model = build_litellm_model(cfg)
    except Exception as e:
        return KyklosResult(
            scores={"score": 0.0, "pass_rate": 0.0},
            passed=False,
            metadata={"error": f"model setup failed: {e}"},
            artifacts=[],
            logs=[f"ERROR: {e}"],
        )

    resolved_model = resolve_litellm_model_id(cfg.get("model"))

    metric = GEval(
        name="Rubric",
        criteria=rubric.strip(),
        evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
        model=litellm_model,
        threshold=threshold,
        async_mode=False,
        verbose_mode=False,
    )

    scores: list[float] = []
    judgements: list[dict] = []
    failure_reasons: list[str] = []

    for i, output in enumerate(outputs):
        case_id = output.get("_case_id", output.get("id", str(i)))
        if output.get("error"):
            scores.append(0.0)
            failure_reasons.append(f"case {case_id}: agent error")
            judgements.append({"id": case_id, "score": 0.0, "reason": "agent error"})
            continue

        test_case = LLMTestCase(
            input=str(output.get("input", "")),
            actual_output=str(output.get("response", "")),
        )
        try:
            score = float(
                metric.measure(
                    test_case,
                    _show_indicator=False,
                    _log_metric_to_confident=False,
                )
            )
            score = max(0.0, min(1.0, score))
            reason = str(getattr(metric, "reason", "") or "")
            scores.append(score)
            judgements.append({"id": case_id, "score": score, "reason": reason})
        except Exception as e:
            scores.append(0.0)
            failure_reasons.append(f"case {case_id}: judge error: {e}")
            judgements.append({"id": case_id, "score": 0.0, "reason": f"judge error: {e}"})

        if (i + 1) % 10 == 0:
            print(f"Judged {i + 1}/{len(outputs)}")

    avg_score = sum(scores) / len(scores) if scores else 0.0
    pass_rate = sum(1 for s in scores if s >= threshold) / len(scores) if scores else 0.0

    out_dir = artifact_dir(ctx.run_id, "llm-judge")
    judgements_path = os.path.join(out_dir, "judgements.jsonl")
    write_jsonl(judgements_path, judgements)

    print(f"LLM Judge — avg score: {avg_score:.3f}, pass rate: {pass_rate:.2%}")

    return KyklosResult(
        scores={"score": avg_score, "pass_rate": pass_rate},
        passed=avg_score >= threshold,
        metadata={
            "avg_score": avg_score,
            "pass_rate": pass_rate,
            "failure_reasons": failure_reasons,
            "judged": len(scores),
            "judge_backend": "deepeval",
            "litellm_model": resolved_model,
        },
        artifacts=[judgements_path],
        logs=[f"avg_score={avg_score:.3f} pass_rate={pass_rate:.2%} model={resolved_model}"],
    )


def _default_rubric() -> str:
    return """Evaluate how well the assistant's response addresses the user's input.
Consider correctness, helpfulness, and clarity. Assign a score from 0 (poor) to 1 (excellent),
consistent with the G-Eval rubric style used by the metric."""


def _resolve_outputs(ctx: KyklosContext, from_ref: str) -> list[dict]:
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl

        try:
            return read_jsonl(ctx.from_result.artifact)
        except Exception:
            pass
    for stage in ctx.previous_results:
        for step in stage.steps:
            if from_ref.split(".")[-1] in (step.name, step.uses):
                if hasattr(step, "metadata") and step.metadata:
                    outs = step.metadata.get("outputs", [])
                    if outs:
                        return outs
    return []


if __name__ == "__main__":
    run_step(run)
