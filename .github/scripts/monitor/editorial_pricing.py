from __future__ import annotations

import os
from typing import Any

# GPT-6 Luna API Standard pricing: longer-than-272k-input-token prompts
# charge 2x all input/cache rates and 1.5x the entire output.
# https://developers.openai.com/api/docs/models/gpt-6-luna
LONG_CONTEXT_THRESHOLD = 272_000
LONG_CONTEXT_MODEL = "gpt-6-luna"


def cost_for_usage(usage: dict[str, Any], *, model: str | None = None) -> dict[str, Any]:
    """Price a completed request or a conservative budget estimate.

    Rates come from the existing workflow configuration; no new API settings
    or service tiers are introduced. Long-context multipliers apply only to
    the explicitly verified GPT-6 Luna model.
    """
    try:
        input_rate = float(os.getenv("EDITORIAL_AI_INPUT_USD_PER_MTOK", ""))
        output_rate = float(os.getenv("EDITORIAL_AI_OUTPUT_USD_PER_MTOK", ""))
        cached_rate = float(os.getenv("EDITORIAL_AI_CACHED_INPUT_USD_PER_MTOK", ""))
        cache_write_rate = float(os.getenv("EDITORIAL_AI_CACHE_WRITE_USD_PER_MTOK", "0"))
    except ValueError:
        input_rate = output_rate = cached_rate = cache_write_rate = 0.0
    if input_rate <= 0 or output_rate <= 0:
        return {"usd": None, "reason": "pricing_not_configured"}

    try:
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        cached_input = int(usage.get("cached_input_tokens") or 0)
        cache_writes = int(usage.get("cache_write_tokens") or 0)
    except (TypeError, ValueError):
        return {"usd": None, "reason": "invalid_token_usage"}
    if min(input_tokens, output_tokens, cached_input, cache_writes) < 0:
        return {"usd": None, "reason": "invalid_token_usage"}
    cached = min(cached_input, input_tokens)
    writes = min(cache_writes, max(0, input_tokens - cached))
    uncached = input_tokens - cached - writes

    actual_model = str(model or os.getenv("EDITORIAL_AI_MODEL", "")).strip()
    long_context = actual_model == LONG_CONTEXT_MODEL and input_tokens > LONG_CONTEXT_THRESHOLD
    input_multiplier = 2.0 if long_context else 1.0
    output_multiplier = 1.5 if long_context else 1.0
    effective_cached = cached_rate if cached_rate > 0 else input_rate
    amount = (
        (uncached * input_rate + cached * effective_cached + writes * cache_write_rate)
        * input_multiplier
        + output_tokens * output_rate * output_multiplier
    ) / 1_000_000
    return {
        "usd": round(amount, 8),
        "input_usd_per_mtok": input_rate * input_multiplier,
        "cached_input_usd_per_mtok": effective_cached * input_multiplier,
        "cache_write_usd_per_mtok": cache_write_rate * input_multiplier,
        "output_usd_per_mtok": output_rate * output_multiplier,
        "long_context": long_context,
    }
