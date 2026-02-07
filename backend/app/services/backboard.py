"""
AI-powered divergence explanations using Google Gemini directly.

Includes rate limiting and caching to prevent excessive API calls.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

import requests

from app.config import BACKBOARD_API_KEY

logger = logging.getLogger("smartcrowd.backboard")

# Try to get Gemini API key (fallback to BACKBOARD for backwards compat)
import os
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

# Rate limiting: track last call time per market
_last_call_times: dict[str, float] = {}
_MIN_INTERVAL_SECONDS = 60  # Minimum 60 seconds between calls for same market

# Simple in-memory cache for explanations
_explanation_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL_SECONDS = 300  # Cache explanations for 5 minutes

SYSTEM_PROMPT = """You are a prediction market analyst for SmartCrowd, a platform that tracks high-accuracy traders ("whales") on Polymarket.

When given market data showing divergence between market odds and SmartCrowd predictions, you analyze:
1. What the divergence means (SmartCrowd is more bullish/bearish than the market)
2. Which cohorts are driving the signal (whale wallets, high Brier score traders, etc.)
3. Why informed traders might see something the market doesn't

Be concise (2-3 sentences max). Focus on actionable insights. Use plain language."""


def _get_cache_key(context: dict[str, Any]) -> str:
    """Generate a cache key from market context."""
    key_data = {
        "market_id": context.get("market_id", ""),
        "divergence": round(context.get("divergence", 0), 2),
        "confidence": round(context.get("confidence", 0), 1),
    }
    return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()


def _is_rate_limited(market_id: str) -> bool:
    """Check if we should rate limit this request."""
    last_call = _last_call_times.get(market_id, 0)
    return (time.time() - last_call) < _MIN_INTERVAL_SECONDS


def _update_rate_limit(market_id: str) -> None:
    """Update the last call time for rate limiting."""
    _last_call_times[market_id] = time.time()


def _get_cached_explanation(cache_key: str) -> str | None:
    """Get cached explanation if still valid."""
    if cache_key in _explanation_cache:
        explanation, timestamp = _explanation_cache[cache_key]
        if (time.time() - timestamp) < _CACHE_TTL_SECONDS:
            logger.info(f"Cache hit for explanation: {cache_key[:8]}...")
            return explanation
        else:
            del _explanation_cache[cache_key]
    return None


def _cache_explanation(cache_key: str, explanation: str) -> None:
    """Cache an explanation with current timestamp."""
    _explanation_cache[cache_key] = (explanation, time.time())
    # Limit cache size
    if len(_explanation_cache) > 100:
        sorted_keys = sorted(
            _explanation_cache.keys(),
            key=lambda k: _explanation_cache[k][1]
        )
        for key in sorted_keys[:20]:
            del _explanation_cache[key]


def _format_context_message(context: dict[str, Any]) -> str:
    """Format market context into a prompt for the AI."""
    divergence = context.get("divergence", 0)
    direction = "more bullish" if divergence > 0 else "more bearish"
    
    top_drivers = context.get("top_drivers", [])
    driver_summary = ""
    if top_drivers:
        driver_details = []
        for d in top_drivers[:3]:
            belief_pct = d.get("belief", 0) * 100
            weight = d.get("weight", 0)
            driver_details.append(f"wallet {d.get('wallet', 'unknown')[:8]}... (belief: {belief_pct:.0f}%, weight: {weight:.2f})")
        driver_summary = f"Top drivers: {', '.join(driver_details)}"
    
    cohort_summary = context.get("cohort_summary", [])
    cohort_text = ""
    if cohort_summary:
        cohort_parts = []
        for c in cohort_summary[:3]:
            cohort_parts.append(f"{c.get('cohort', 'Unknown')} ({c.get('wallet_count', 0)} wallets, avg belief: {c.get('avg_belief', 0):.0%})")
        cohort_text = f"Cohort breakdown: {', '.join(cohort_parts)}"
    
    message = f"""Analyze this market divergence:

Market: "{context.get('question', 'Unknown market')}"
Category: {context.get('category', 'Unknown')}

Current Prices:
- Market probability: {context.get('market_prob', 0):.1%}
- SmartCrowd probability: {context.get('smartcrowd_prob', 0):.1%}
- Divergence: {abs(divergence):.1%} (SmartCrowd is {direction})

Signal Quality:
- Confidence: {context.get('confidence', 0):.2f}
- Integrity risk: {context.get('integrity_risk', 0):.2f}
- Active wallets: {context.get('active_wallets', 0)}

{driver_summary}
{cohort_text}

Explain in 2-3 sentences why SmartCrowd disagrees with the market and what informed traders might see."""

    return message.strip()


def explain_divergence(context: dict[str, Any]) -> dict[str, Any]:
    """
    Generate an AI explanation for market divergence using Gemini.
    
    Includes rate limiting and caching to prevent API abuse.
    """
    market_id = context.get("market_id", "unknown")
    
    # Check rate limit
    if _is_rate_limited(market_id):
        remaining = _MIN_INTERVAL_SECONDS - (time.time() - _last_call_times.get(market_id, 0))
        logger.warning(f"Rate limited for market {market_id}, {remaining:.0f}s remaining")
        return {
            "explanation": None,
            "error": f"Please wait {remaining:.0f} seconds before requesting another explanation for this market.",
            "rate_limited": True,
        }
    
    # Check cache
    cache_key = _get_cache_key(context)
    cached = _get_cached_explanation(cache_key)
    if cached:
        return {
            "explanation": cached,
            "cached": True,
            "cache_key": cache_key[:8],
        }
    
    # Check API key
    if not GEMINI_API_KEY:
        logger.error("GEMINI_API_KEY not configured")
        return {
            "explanation": None,
            "error": "Gemini API key not configured. Please add GEMINI_API_KEY to your .env file.",
        }
    
    try:
        # Call Gemini API directly
        url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"
        
        prompt = _format_context_message(context)
        
        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": f"{SYSTEM_PROMPT}\n\n{prompt}"}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 256,
            }
        }
        
        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30,
        )
        response.raise_for_status()
        
        data = response.json()
        
        # Extract text from Gemini response
        explanation = ""
        if "candidates" in data and data["candidates"]:
            candidate = data["candidates"][0]
            if "content" in candidate and "parts" in candidate["content"]:
                parts = candidate["content"]["parts"]
                if parts and "text" in parts[0]:
                    explanation = parts[0]["text"].strip()
        
        if explanation:
            _update_rate_limit(market_id)
            _cache_explanation(cache_key, explanation)
            
            logger.info(f"Generated explanation for market {market_id}")
            return {
                "explanation": explanation,
                "cached": False,
            }
        else:
            return {
                "explanation": None,
                "error": "No explanation received from AI",
            }
            
    except requests.RequestException as e:
        logger.error(f"Gemini API error: {e}")
        return {
            "explanation": None,
            "error": f"Failed to get AI explanation: {str(e)}",
        }
    except Exception as e:
        logger.error(f"Unexpected error in explain_divergence: {e}")
        return {
            "explanation": None,
            "error": f"Unexpected error: {str(e)}",
        }
