"""
AI-powered divergence explanations using Backboard.io with Google Gemini.

Backboard.io acts as a unified API layer that routes to Gemini using BYOK (Bring Your Own Key).
Includes rate limiting and caching to prevent excessive API calls.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any

import requests

  logger = logging.getLogger("smartcrowd.backboard")

# Backboard.io API configuration
BACKBOARD_API_KEY = os.getenv("BACKBOARD_API_KEY", "")
BACKBOARD_API_URL = "https://app.backboard.io/api"

# Rate limiting: track last call time per market
_last_call_times: dict[str, float] = {}
_MIN_INTERVAL_SECONDS = 60  # Minimum 60 seconds between calls for same market

# Simple in-memory cache for explanations
_explanation_cache: dict[str, tuple[str, float]] = {}
_CACHE_TTL_SECONDS = 300  # Cache explanations for 5 minutes

# Cache for assistant ID
_assistant_id: str | None = None

SYSTEM_PROMPT = """You are a prediction market analyst for SmartCrowd, a platform that tracks high-accuracy traders ("whales") on Polymarket.

When given market data showing divergence between market odds and Precognition predictions, you analyze:
1. What the divergence means (Precognition is more bullish/bearish than the market)
2. Which cohorts are driving the signal (whale wallets, high Brier score traders, etc.)
3. Why informed traders might see something the market doesn't

Be concise (2-3 sentences max). Focus on actionable insights. Use plain language."""


def _get_headers() -> dict[str, str]:
    """Get the correct headers for Backboard.io API."""
    return {
        "X-API-Key": BACKBOARD_API_KEY,  # Correct auth header per Backboard.io docs
        "Content-Type": "application/json",
    }


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


def _get_or_create_assistant() -> str:
    """Get or create a Backboard.io assistant for market analysis."""
    global _assistant_id
    
    if _assistant_id:
        return _assistant_id
    
    # Create a new assistant configured to use Gemini
    payload = {
        "name": "SmartCrowd Market Analyst",
        "system_prompt": SYSTEM_PROMPT,
        "llm_provider": "google",
        "model_name": "gemini-2.0-flash",  # Changed from llm_model_name to model_name per docs
    }
    
    response = requests.post(
        f"{BACKBOARD_API_URL}/assistants",
        json=payload,
        headers=_get_headers(),
        timeout=30,
    )
    response.raise_for_status()
    
    data = response.json()
    _assistant_id = data.get("assistant_id") or data.get("id")
    logger.info(f"Created Backboard.io assistant: {_assistant_id}")
    
    return _assistant_id


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
- Precognition probability: {context.get('precognition_prob', 0):.1%}
- Divergence: {abs(divergence):.1%} (Precognition is {direction})

Signal Quality:
- Confidence: {context.get('confidence', 0):.2f}
- Integrity risk: {context.get('integrity_risk', 0):.2f}
- Active wallets: {context.get('active_wallets', 0)}

{driver_summary}
{cohort_text}

Explain in 2-3 sentences why Precognition disagrees with the market and what informed traders might see."""

    return message.strip()


def explain_divergence(context: dict[str, Any]) -> dict[str, Any]:
    """
    Generate an AI explanation for market divergence using Backboard.io + Gemini.
    
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
    if not BACKBOARD_API_KEY:
        logger.error("BACKBOARD_API_KEY not configured")
        return {
            "explanation": None,
            "error": "Backboard.io API key not configured. Please add BACKBOARD_API_KEY to your .env file.",
        }
    
    try:
        # Get or create assistant
        assistant_id = _get_or_create_assistant()
        
        # Create a thread for this assistant
        thread_response = requests.post(
            f"{BACKBOARD_API_URL}/assistants/{assistant_id}/threads",
            json={},
            headers=_get_headers(),
            timeout=30,
        )
        thread_response.raise_for_status()
        thread_data = thread_response.json()
        thread_id = thread_data.get("thread_id") or thread_data.get("id")
        
        # Send message and get response (non-streaming)
        prompt = _format_context_message(context)
        # For messages endpoint, use form data (not JSON) per Backboard.io docs
        message_headers = {"X-API-Key": BACKBOARD_API_KEY}  # No Content-Type for form data
        message_response = requests.post(
            f"{BACKBOARD_API_URL}/threads/{thread_id}/messages",
            headers=message_headers,
            data={"content": prompt, "stream": "false", "memory": "Off"},
            timeout=60,
        )
        message_response.raise_for_status()
        message_data = message_response.json()
        
        # Extract explanation from response
        explanation = message_data.get("content", "")
        
        if explanation:
            _update_rate_limit(market_id)
            _cache_explanation(cache_key, explanation)
            
            logger.info(f"Generated explanation for market {market_id} via Backboard.io")
            return {
                "explanation": explanation,
                "cached": False,
                "provider": "backboard.io",
            }
        else:
            logger.warning(f"Empty response from Backboard.io: {message_data}")
            return {
                "explanation": None,
                "error": "No explanation received from AI",
            }
            
    except requests.RequestException as e:
        logger.error(f"Backboard.io API error: {e}")
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
