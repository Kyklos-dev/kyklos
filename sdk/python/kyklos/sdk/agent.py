"""
Agent invocation helpers for built-in steps.

run_agent() dispatches on agent_config.runner.type:
  - anthropic (default): Anthropic Messages API
  - openai: OpenAI Chat Completions (OPENAI_API_KEY; pip install openai)
  - gemini / google: Google Generative AI (GOOGLE_API_KEY; pip install google-generativeai)
  - script: user Python script on FD 3

Provider batch APIs (OpenAI Batch, Anthropic Message Batches) are not built into Kyklos;
use kyklos/http-judge against a small service that submits/polls batch jobs, or a script runner.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from typing import Any


# ── Model pricing (per million tokens, USD) ──────────────────────────────────
MODEL_PRICING: dict[str, dict[str, float]] = {
    "claude-opus-4-6":       {"input": 15.0,  "output": 75.0},
    "claude-sonnet-4-6":     {"input": 3.0,   "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 0.25, "output": 1.25},
    "gpt-4o":                {"input": 5.0,   "output": 15.0},
    "gpt-4o-mini":           {"input": 0.15,  "output": 0.60},
    "gpt-4-turbo":           {"input": 10.0,  "output": 30.0},
    "gemini-1.5-flash":      {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":        {"input": 1.25,  "output": 5.0},
    "gemini-2.0-flash":      {"input": 0.10,  "output": 0.40},
}
_DEFAULT_PRICING = {"input": 3.0, "output": 15.0}


def cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate API cost in USD for a single call."""
    pricing = MODEL_PRICING.get(model, _DEFAULT_PRICING)
    return (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000


# ── Tool definition loader ────────────────────────────────────────────────────

def load_tool_definitions(agent_config: dict, workspace: str) -> list[dict] | None:
    """
    Try to load Anthropic-format tool definitions from tools.json in the workspace.
    Returns None if no file is found (agent runs without tools).
    """
    candidates = [
        os.path.join(workspace, "tools.json"),
        os.path.join(workspace, "tools", "tools.json"),
    ]
    for path in candidates:
        if os.path.exists(path):
            with open(path) as f:
                return json.load(f)
    return None


# ── Anthropic runner ──────────────────────────────────────────────────────────

def _run_anthropic(agent_config: dict, test_case: dict, workspace: str) -> dict:
    try:
        import anthropic as _anthropic
    except ImportError:
        return _error_result(test_case, "anthropic package not installed — run: pip install anthropic")

    model = agent_config.get("model", "claude-sonnet-4-6")
    prompt_file = agent_config.get("prompt", "")
    temperature = float(agent_config.get("temperature", 0.0))
    max_tokens = int(agent_config.get("max_tokens", 4096))

    system_prompt = ""
    if prompt_file:
        # prompt_file is already absolute (resolved by parser)
        try:
            with open(prompt_file) as f:
                system_prompt = f.read()
        except OSError:
            pass

    tools = load_tool_definitions(agent_config, workspace)

    user_input = test_case.get("input", "")
    messages: list[dict] = [{"role": "user", "content": user_input}]

    client = _anthropic.Anthropic()
    start_ms = time.time() * 1000

    try:
        kwargs: dict[str, Any] = {
            "model": model,
            "max_tokens": max_tokens,
            "messages": messages,
        }
        if system_prompt:
            kwargs["system"] = system_prompt
        if temperature != 0.0:
            kwargs["temperature"] = temperature
        if tools:
            kwargs["tools"] = tools

        response = client.messages.create(**kwargs)
        latency_ms = time.time() * 1000 - start_ms

        response_text = ""
        tool_calls: list[dict] = []
        for block in response.content:
            if block.type == "text":
                response_text += block.text
            elif block.type == "tool_use":
                tool_calls.append({
                    "name": block.name,
                    "input": block.input,
                    "id": block.id,
                })

        return {
            "id": test_case.get("id", ""),
            "input": user_input,
            "response": response_text,
            "tool_calls": tool_calls,
            "usage": {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            },
            "cost_usd": cost_usd(model, response.usage.input_tokens, response.usage.output_tokens),
            "latency_ms": latency_ms,
            "stop_reason": response.stop_reason,
            "model": model,
            "error": None,
        }
    except Exception as e:
        return _error_result(test_case, str(e))


# ── OpenAI runner (Chat Completions) ───────────────────────────────────────────

def _run_openai(agent_config: dict, test_case: dict, workspace: str) -> dict:
    try:
        from openai import OpenAI
    except ImportError:
        return _error_result(test_case, "openai package not installed — run: pip install openai")

    model = agent_config.get("model", "gpt-4o-mini")
    prompt_file = agent_config.get("prompt", "")
    temperature = float(agent_config.get("temperature", 0.0))
    max_tokens = int(agent_config.get("max_tokens", 4096))

    system_prompt = ""
    if prompt_file:
        try:
            with open(prompt_file) as f:
                system_prompt = f.read()
        except OSError:
            pass

    user_input = test_case.get("input", "")
    messages: list[dict[str, str]] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_input})

    client = OpenAI()
    start_ms = time.time() * 1000
    try:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
        }
        if temperature > 0.0:
            kwargs["temperature"] = temperature
        response = client.chat.completions.create(**kwargs)
        latency_ms = time.time() * 1000 - start_ms
        text = (response.choices[0].message.content or "").strip()
        in_tok = getattr(response.usage, "prompt_tokens", 0) or 0
        out_tok = getattr(response.usage, "completion_tokens", 0) or 0
        return {
            "id": test_case.get("id", ""),
            "input": user_input,
            "response": text,
            "tool_calls": [],
            "usage": {"input_tokens": in_tok, "output_tokens": out_tok},
            "cost_usd": cost_usd(model, in_tok, out_tok),
            "latency_ms": latency_ms,
            "stop_reason": getattr(response.choices[0], "finish_reason", None),
            "model": model,
            "error": None,
        }
    except Exception as e:
        return _error_result(test_case, str(e))


# ── Google Gemini runner ───────────────────────────────────────────────────────

def _run_gemini(agent_config: dict, test_case: dict, workspace: str) -> dict:
    try:
        import google.generativeai as genai
    except ImportError:
        return _error_result(
            test_case,
            "google-generativeai not installed — run: pip install google-generativeai",
        )

    model = agent_config.get("model", "gemini-1.5-flash")
    prompt_file = agent_config.get("prompt", "")
    temperature = float(agent_config.get("temperature", 0.0))
    max_tokens = int(agent_config.get("max_tokens", 4096))

    system_prompt = ""
    if prompt_file:
        try:
            with open(prompt_file) as f:
                system_prompt = f.read()
        except OSError:
            pass

    user_input = test_case.get("input", "")
    genai.configure(api_key=os.environ.get("GOOGLE_API_KEY"))
    start_ms = time.time() * 1000
    try:
        gen_cfg: dict[str, Any] = {"max_output_tokens": max_tokens}
        if temperature > 0.0:
            gen_cfg["temperature"] = temperature
        if system_prompt:
            mdl = genai.GenerativeModel(model, system_instruction=system_prompt)
        else:
            mdl = genai.GenerativeModel(model)
        resp = mdl.generate_content(user_input, generation_config=gen_cfg)
        latency_ms = time.time() * 1000 - start_ms
        text = (resp.text or "").strip()
        in_tok = out_tok = 0
        try:
            uc = resp.usage_metadata
            in_tok = int(getattr(uc, "prompt_token_count", 0) or 0)
            out_tok = int(getattr(uc, "candidates_token_count", 0) or 0)
        except Exception:
            pass
        return {
            "id": test_case.get("id", ""),
            "input": user_input,
            "response": text,
            "tool_calls": [],
            "usage": {"input_tokens": in_tok, "output_tokens": out_tok},
            "cost_usd": cost_usd(model, in_tok, out_tok),
            "latency_ms": latency_ms,
            "stop_reason": None,
            "model": model,
            "error": None,
        }
    except Exception as e:
        return _error_result(test_case, str(e))


# ── Script runner ─────────────────────────────────────────────────────────────

def _run_script(script_path: str, agent_config: dict, test_case: dict, env: dict) -> dict:
    """
    Invoke a user-supplied agent script.

    The script receives via stdin:
      {"agent_config": {...}, "test_case": {...}}

    It must write its result to FD 3 (KYKLOS_RESULT_FD=3) as JSON:
      {"response": "...", "tool_calls": [...], "usage": {...}, "latency_ms": 0.0, "error": null}
    """
    import os as _os
    payload = json.dumps({"agent_config": agent_config, "test_case": test_case})
    r, w = _os.pipe()
    try:
        proc_env = {**_os.environ, **env, "KYKLOS_RESULT_FD": "3"}
        result = subprocess.run(
            [sys.executable, script_path],
            input=payload.encode(),
            capture_output=True,
            env=proc_env,
            pass_fds=(w,),
            timeout=120,
        )
        _os.close(w)
        raw = _os.read(r, 65536)
        _os.close(r)
        if not raw:
            return _error_result(test_case, f"script produced no result (exit {result.returncode})")
        return json.loads(raw.decode())
    except Exception as e:
        try:
            _os.close(r)
            _os.close(w)
        except Exception:
            pass
        return _error_result(test_case, str(e))


# ── Public dispatcher ─────────────────────────────────────────────────────────

def run_agent(agent_config: dict, test_case: dict, workspace: str, env: dict) -> dict:
    """
    Run the agent on one test case. Dispatches on agent_config.runner.type.

    Returns a result dict with keys:
      id, input, response, tool_calls, usage, cost_usd, latency_ms,
      stop_reason, model, error
    """
    runner = agent_config.get("runner", {})
    runner_type = runner.get("type", "anthropic") if runner else "anthropic"

    if runner_type == "anthropic":
        return _run_anthropic(agent_config, test_case, workspace)
    elif runner_type == "openai":
        return _run_openai(agent_config, test_case, workspace)
    elif runner_type in ("gemini", "google"):
        return _run_gemini(agent_config, test_case, workspace)
    elif runner_type == "script":
        script = runner.get("script", "")
        if not script:
            return _error_result(test_case, "runner.script is required when type=script")
        return _run_script(script, agent_config, test_case, env)
    else:
        return _error_result(test_case, f"unknown runner type {runner_type!r}")


def _error_result(test_case: dict, msg: str) -> dict:
    return {
        "id": test_case.get("id", ""),
        "input": test_case.get("input", ""),
        "response": "",
        "tool_calls": [],
        "usage": {"input_tokens": 0, "output_tokens": 0},
        "cost_usd": 0.0,
        "latency_ms": 0.0,
        "stop_reason": "error",
        "model": "",
        "error": msg,
    }
