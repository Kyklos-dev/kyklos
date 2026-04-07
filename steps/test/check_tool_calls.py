"""
kyklos/check-tool-calls — validates tool call accuracy from run-dataset traces.

Checks three metrics against dataset expected values:
  tool_selection_accuracy — correct tool chosen
  param_accuracy          — correct parameters passed
  order_accuracy          — tool calls appeared in expected order (multi-tool)
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, read_jsonl


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config

    dataset_path = cfg.get("dataset", "")
    if dataset_path and not os.path.isabs(dataset_path):
        dataset_path = os.path.join(ctx.workspace, dataset_path)

    from_ref = cfg.get("from", "run-dataset")

    # Locate run-dataset outputs from previous results
    outputs = _get_outputs(ctx, from_ref)
    if outputs is None:
        return KyklosResult(
            scores={"tool_selection_accuracy": 0.0, "param_accuracy": 0.0, "order_accuracy": 0.0},
            passed=False,
            metadata={"error": f"could not find outputs from step {from_ref!r}"},
            artifacts=[],
            logs=[f"ERROR: step {from_ref!r} outputs not found in context"],
        )

    if not dataset_path or not os.path.exists(dataset_path):
        return KyklosResult(
            scores={"tool_selection_accuracy": 0.0, "param_accuracy": 0.0, "order_accuracy": 0.0},
            passed=False,
            metadata={"error": f"dataset not found: {dataset_path}"},
            artifacts=[],
            logs=[f"ERROR: dataset not found: {dataset_path}"],
        )

    cases = {c.get("id", str(i)): c for i, c in enumerate(read_jsonl(dataset_path))}

    tool_correct = 0
    param_correct = 0
    order_correct = 0
    total = 0
    mismatches: list[dict] = []

    for output in outputs:
        case_id = output.get("_case_id", output.get("id", ""))
        case = cases.get(case_id)
        if not case:
            continue

        tool_calls = output.get("tool_calls", [])
        expected_tool = case.get("expected_tool")
        expected_params = case.get("expected_params", {})
        expected_order = case.get("expected_tool_order", [])

        total += 1

        # Tool selection
        actual_names = [tc.get("name") for tc in tool_calls]
        sel_ok = expected_tool is None or expected_tool in actual_names
        if sel_ok:
            tool_correct += 1
        else:
            mismatches.append({
                "case_id": case_id,
                "type": "tool_selection",
                "expected": expected_tool,
                "got": actual_names,
            })

        # Parameter accuracy — check the first matching tool call
        if expected_params and expected_tool:
            tc_match = next((tc for tc in tool_calls if tc.get("name") == expected_tool), None)
            if tc_match:
                actual_params = tc_match.get("input", {})
                params_ok = all(
                    str(actual_params.get(k)) == str(v)
                    for k, v in expected_params.items()
                )
                if params_ok:
                    param_correct += 1
                else:
                    mismatches.append({
                        "case_id": case_id,
                        "type": "param_accuracy",
                        "expected": expected_params,
                        "got": actual_params,
                    })
            else:
                # Tool wasn't called at all — param check fails
                pass
        else:
            param_correct += 1  # no expectation → pass

        # Order accuracy
        if expected_order:
            order_ok = actual_names[:len(expected_order)] == expected_order
            if order_ok:
                order_correct += 1
            else:
                mismatches.append({
                    "case_id": case_id,
                    "type": "order",
                    "expected": expected_order,
                    "got": actual_names,
                })
        else:
            order_correct += 1

    if total == 0:
        return KyklosResult(
            scores={"tool_selection_accuracy": 1.0, "param_accuracy": 1.0, "order_accuracy": 1.0},
            passed=True,
            metadata={"warning": "no cases with tool expectations found in dataset"},
            artifacts=[],
            logs=["No tool expectations in dataset — skipped"],
        )

    tool_acc = tool_correct / total
    param_acc = param_correct / total
    order_acc = order_correct / total

    print(f"Tool selection accuracy: {tool_acc:.2%} ({tool_correct}/{total})")
    print(f"Param accuracy:          {param_acc:.2%} ({param_correct}/{total})")
    print(f"Order accuracy:          {order_acc:.2%} ({order_correct}/{total})")
    if mismatches:
        print(f"Mismatches: {len(mismatches)}")

    return KyklosResult(
        scores={
            "tool_selection_accuracy": tool_acc,
            "param_accuracy": param_acc,
            "order_accuracy": order_acc,
        },
        passed=tool_acc >= 0.80 and param_acc >= 0.80,
        metadata={"total": total, "mismatches": mismatches},
        artifacts=[],
        logs=[
            f"tool_selection={tool_acc:.2%}",
            f"param={param_acc:.2%}",
            f"order={order_acc:.2%}",
        ],
    )


def _get_outputs(ctx: KyklosContext, from_ref: str) -> list[dict] | None:
    """Resolve run-dataset outputs from context.from_result or previous_results."""
    # If from_result is pre-resolved by the engine, use it directly
    if ctx.from_result and ctx.from_result.name == from_ref.split(".")[-1]:
        metadata = getattr(ctx.from_result, "metadata", {})
        if metadata and "outputs" in metadata:
            return metadata["outputs"]

    # Walk previous_results looking for outputs in metadata
    for stage in ctx.previous_results:
        for step in stage.steps:
            if from_ref in (step.name, step.uses):
                return None  # metadata not carried on summary — step must use artifact

    # Try loading from the from_result artifact path
    if ctx.from_result and ctx.from_result.artifact:
        from kyklos.sdk import read_jsonl as _rj
        try:
            return _rj(ctx.from_result.artifact)
        except Exception:
            pass

    return None


if __name__ == "__main__":
    run_step(run)
