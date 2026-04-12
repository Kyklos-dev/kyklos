"""Shared DeepEval + LiteLLM helpers for Kyklos evaluate steps (provider-neutral judges)."""

from __future__ import annotations

from typing import Any


def resolve_litellm_model_id(model: str | None) -> str:
    """
    Return a LiteLLM model id (``provider/model``).

    Kyklos YAML often uses bare API ids (e.g. ``claude-sonnet-4-6``); LiteLLM expects a
    provider prefix. If the value already contains ``/``, it is returned unchanged.
    """
    if not model or not str(model).strip():
        return "openai/gpt-4o-mini"
    m = str(model).strip()
    if "/" in m:
        return m
    if m.startswith("claude-"):
        return f"anthropic/{m}"
    if m.startswith(("gpt-", "o1", "o3", "o4")):
        return f"openai/{m}"
    return f"openai/{m}"


def build_litellm_model(cfg: dict[str, Any]) -> Any:
    """Build ``deepeval.models.LiteLLMModel`` from ``stage_config``."""
    from deepeval.models import LiteLLMModel

    model_id = resolve_litellm_model_id(cfg.get("model"))
    kwargs: dict[str, Any] = {"model": model_id}
    if cfg.get("base_url"):
        kwargs["base_url"] = str(cfg["base_url"])
    if cfg.get("api_key"):
        kwargs["api_key"] = str(cfg["api_key"])
    if cfg.get("temperature") is not None:
        kwargs["temperature"] = float(cfg["temperature"])
    return LiteLLMModel(**kwargs)
