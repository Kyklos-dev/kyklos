"""
kyklos/simulate-conversation — drives multi-turn conversations automatically.

Each scenario defines a persona, a goal, and a success criterion.
A simulated user LLM drives the conversation turn-by-turn until the goal
is met or max_turns is reached.
"""

from __future__ import annotations

import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk", "python"))

from kyklos.sdk import KyklosContext, KyklosResult, run_step, artifact_dir, read_jsonl, write_jsonl, run_agent


def run(ctx: KyklosContext) -> KyklosResult:
    cfg = ctx.stage_config
    agent = ctx.config.get("agent", {})

    scenarios_path = cfg.get("scenarios", "")
    if scenarios_path and not os.path.isabs(scenarios_path):
        scenarios_path = os.path.join(ctx.workspace, scenarios_path)

    max_turns = int(cfg.get("max_turns", 8))
    runs_per_scenario = int(cfg.get("runs", 1))

    if not scenarios_path or not os.path.exists(scenarios_path):
        return KyklosResult(
            scores={"goal_completion_rate": 0.0, "avg_turns": 0.0},
            passed=False,
            metadata={"error": f"scenarios file not found: {scenarios_path}"},
            artifacts=[],
            logs=[f"ERROR: scenarios not found: {scenarios_path}"],
        )

    scenarios = read_jsonl(scenarios_path)
    print(f"Loaded {len(scenarios)} scenarios × {runs_per_scenario} run(s)")

    transcripts: list[dict] = []
    goals_met = 0
    total_turns_list: list[int] = []

    for scenario in scenarios:
        for run_idx in range(runs_per_scenario):
            transcript, met, turns = _run_scenario(
                scenario, agent, ctx.workspace, ctx.env, max_turns
            )
            transcripts.append({
                "scenario_id": scenario.get("id", ""),
                "run_index": run_idx,
                "goal_met": met,
                "turns": turns,
                "transcript": transcript,
            })
            if met:
                goals_met += 1
            total_turns_list.append(turns)
            print(f"Scenario {scenario.get('id', '?')} run {run_idx}: "
                  f"{'GOAL MET' if met else 'goal not met'} in {turns} turn(s)")

    total = len(scenarios) * runs_per_scenario
    goal_completion_rate = goals_met / total if total > 0 else 0.0
    avg_turns = sum(total_turns_list) / len(total_turns_list) if total_turns_list else 0.0

    out_dir = artifact_dir(ctx.run_id, "simulate-conversation")
    transcripts_path = os.path.join(out_dir, "transcripts.jsonl")
    write_jsonl(transcripts_path, transcripts)

    print(f"Goal completion rate: {goal_completion_rate:.2%}, avg turns: {avg_turns:.1f}")

    return KyklosResult(
        scores={
            "goal_completion_rate": goal_completion_rate,
            "avg_turns": avg_turns,
        },
        passed=goal_completion_rate >= 0.70,
        metadata={
            "total": total,
            "goals_met": goals_met,
            "goal_completion_rate": goal_completion_rate,
            "avg_turns": avg_turns,
            "transcripts": transcripts,
        },
        artifacts=[transcripts_path],
        logs=[f"Goal completion: {goal_completion_rate:.2%}, avg turns: {avg_turns:.1f}"],
    )


def _run_scenario(
    scenario: dict,
    agent_config: dict,
    workspace: str,
    env: dict,
    max_turns: int,
) -> tuple[list[dict], bool, int]:
    """
    Run one scenario and return (transcript, goal_met, turn_count).

    The simulated user is driven by a simple heuristic: it sends the persona
    description as the first message, then echoes back tool-call results with
    a follow-up. For V1 we don't spawn a second LLM for the user — the
    scenario's goal and success_criteria are checked by string matching against
    the agent's final response.
    """
    persona = scenario.get("persona", "")
    goal = scenario.get("goal", "")
    success_criteria = scenario.get("success_criteria", "")

    transcript: list[dict] = []
    conversation_history: list[dict] = []
    goal_met = False

    # First user turn
    user_message = f"[Persona: {persona}] I need help with: {goal}"

    for turn in range(max_turns):
        test_case = {"id": f"turn-{turn}", "input": user_message}
        result = run_agent(agent_config, test_case, workspace, env)

        transcript.append({
            "turn": turn + 1,
            "user": user_message,
            "assistant": result.get("response", ""),
            "tool_calls": result.get("tool_calls", []),
            "error": result.get("error"),
        })

        if result.get("error"):
            break

        agent_response = result.get("response", "")
        tool_calls = result.get("tool_calls", [])

        # Check success: success_criteria matched in response or as a tool call name
        if success_criteria:
            criteria_lower = success_criteria.lower()
            if (criteria_lower in agent_response.lower() or
                    any(criteria_lower in tc.get("name", "").lower() for tc in tool_calls)):
                goal_met = True
                break

        # Generate next user turn: acknowledge tool calls or ask follow-up
        if tool_calls:
            tool_names = [tc.get("name", "tool") for tc in tool_calls]
            user_message = f"Thanks for using {', '.join(tool_names)}. Is my {goal} resolved now?"
        else:
            user_message = f"Can you confirm my {goal} has been handled?"

    return transcript, goal_met, len(transcript)


if __name__ == "__main__":
    run_step(run)
