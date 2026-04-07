"""
kyklos/run-dataset — runs the agent against every case in a JSONL dataset.

This is the primary execution step. All evaluate steps consume its outputs
via from: test.run-dataset (or whatever stage it lives in).
"""

from __future__ import annotations

import concurrent.futures
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, read_jsonl, write_jsonl, write_json, run_agent


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    agent = ctx.config.get("agent", {})

    dataset_path = cfg.get("dataset", "")
    if dataset_path and not os.path.isabs(dataset_path):
        dataset_path = os.path.join(ctx.workspace, dataset_path)

    runs_per_case = int(cfg.get("runs", 1))
    concurrency = int(cfg.get("concurrency", 1))
    timeout_per_run = int(cfg.get("timeout_per_run", 60))

    if not dataset_path or not os.path.exists(dataset_path):
        return KyklosResult(
            scores={"total_runs": 0, "failed_runs": 0},
            passed=False,
            metadata={"error": f"dataset not found: {dataset_path}"},
            artifacts=[],
            logs=[f"ERROR: dataset not found: {dataset_path}"],
        )

    cases = read_jsonl(dataset_path)
    print(f"Dataset loaded: {len(cases)} cases × {runs_per_case} run(s) = {len(cases) * runs_per_case} total")

    # Build the full work list: (case, run_index) pairs
    work = [(case, i) for case in cases for i in range(runs_per_case)]
    total = len(work)
    outputs: list[dict] = [None] * total  # type: ignore
    failed = 0

    def execute_one(idx: int, case: dict, run_idx: int) -> None:
        result = run_agent(agent, case, ctx.workspace, ctx.env)
        result["_case_id"] = case.get("id", f"case-{idx}")
        result["_run_index"] = run_idx
        outputs[idx] = result

    start = time.time()

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, concurrency)) as pool:
        futures = {
            pool.submit(execute_one, i, case, run_idx): i
            for i, (case, run_idx) in enumerate(work)
        }
        done_count = 0
        for future in concurrent.futures.as_completed(futures, timeout=timeout_per_run * total):
            future.result()  # re-raise any exception
            done_count += 1
            if done_count % max(1, total // 10) == 0:
                print(f"Progress: {done_count}/{total}")

    elapsed = time.time() - start

    for o in outputs:
        if o and o.get("error"):
            failed += 1

    passed = failed <= total * 0.10  # allow up to 10% failures by default

    # Persist outputs for downstream evaluate steps
    out_dir = artifact_dir(ctx.run_id, "run-dataset")
    outputs_path = os.path.join(out_dir, "outputs.jsonl")
    write_jsonl(outputs_path, [o for o in outputs if o])

    summary = {
        "total_runs": total,
        "failed_runs": failed,
        "success_rate": (total - failed) / total if total > 0 else 0.0,
        "elapsed_seconds": round(elapsed, 2),
        "outputs": outputs,   # included in metadata for downstream steps
    }

    print(f"Completed: {total - failed}/{total} succeeded in {elapsed:.1f}s")

    return KyklosResult(
        scores={
            "total_runs": float(total),
            "failed_runs": float(failed),
            "success_rate": summary["success_rate"],
        },
        passed=passed,
        metadata=summary,
        artifacts=[outputs_path],
        logs=[f"{total - failed}/{total} runs succeeded in {elapsed:.1f}s"],
    )


if __name__ == "__main__":
    run_step(run)
