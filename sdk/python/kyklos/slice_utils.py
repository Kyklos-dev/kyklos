"""Helpers for per-slice metrics (LLMOps subgroup gates)."""

from __future__ import annotations

import re


def slice_score_key(label: object) -> str:
    """Score name for engine pass_if: <step>.slice_<slug> (e.g. slice_eu)."""
    s = str(label).strip()
    if not s:
        s = "unknown"
    slug = re.sub(r"[^a-zA-Z0-9_]+", "_", s)
    slug = re.sub(r"_+", "_", slug).strip("_")
    if not slug:
        slug = "unknown"
    return f"slice_{slug}"
