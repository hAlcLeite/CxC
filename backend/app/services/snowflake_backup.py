"""
Snowflake Cortex API client for sentiment analysis.

Uses Snowflake's built-in SENTIMENT function via REST API to analyze
public sentiment about prediction market topics.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any

import requests

logger = logging.getLogger("smartcrowd.snowflake")

# Snowflake API configuration
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD", "")

# Rate limiting
_last_call_times: dict[str, float] = {}
_MIN_INTERVAL_SECONDS = 30  # 30 seconds between calls for same market

# Simple in-memory cache
_sentiment_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 900  # Cache for 15 minutes (news doesn't change fast)


def _get_cache_key(market_id: str, topic: str) -> str:
    """Generate a cache key from market ID and topic."""
    key_data = {"market_id": market_id, "topic": topic.lower().strip()}
    return hashlib.md5(json.dumps(key_data, sort_keys=True).encode()).hexdigest()


def _is_rate_limited(market_id: str) -> bool:
    """Check if we should rate limit this request."""
    last_call = _last_call_times.get(market_id, 0)
    return (time.time() - last_call) < _MIN_INTERVAL_SECONDS


def _update_rate_limit(market_id: str) -> None:
    """Update the last call time for rate limiting."""
    _last_call_times[market_id] = time.time()


def _get_cached_sentiment(cache_key: str) -> dict | None:
    """Get cached sentiment if still valid."""
    if cache_key in _sentiment_cache:
        data, timestamp = _sentiment_cache[cache_key]
        if (time.time() - timestamp) < _CACHE_TTL_SECONDS:
            logger.info(f"Cache hit for sentiment: {cache_key[:8]}...")
            return data
        else:
            del _sentiment_cache[cache_key]
    return None


def _cache_sentiment(cache_key: str, data: dict) -> None:
    """Cache sentiment data with current timestamp."""
    _sentiment_cache[cache_key] = (data, time.time())
    # Limit cache size
    if len(_sentiment_cache) > 100:
        sorted_keys = sorted(
            _sentiment_cache.keys(),
            key=lambda k: _sentiment_cache[k][1]
        )
        for key in sorted_keys[:20]:
            del _sentiment_cache[key]


def _get_snowflake_token() -> str | None:
    """
    Get a Snowflake session token via key-pair or password auth.
    For the hackathon, we use password auth for simplicity.
    """
    if not SNOWFLAKE_ACCOUNT or not SNOWFLAKE_USER or not SNOWFLAKE_PASSWORD:
        return None
    
    try:
        # Snowflake OAuth token endpoint
        auth_url = f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/oauth/token"
        
        response = requests.post(
            auth_url,
            data={
                "grant_type": "password",
                "username": SNOWFLAKE_USER,
                "password": SNOWFLAKE_PASSWORD,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=30,
        )
        
        if response.status_code == 200:
            return response.json().get("access_token")
        else:
            logger.warning(f"Snowflake auth failed: {response.status_code}")
            return None
            
    except Exception as e:
        logger.error(f"Snowflake token error: {e}")
        return None


def analyze_sentiment_simple(text: str) -> float:
    """
    Simple rule-based sentiment as fallback when Snowflake API unavailable.
    Returns score from -1 (negative) to +1 (positive).
    """
    text_lower = text.lower()
    
    positive_words = [
        "rally", "surge", "rise", "jump", "gain", "bullish", "optimistic",
        "growth", "soar", "boom", "strong", "positive", "up", "higher",
        "beat", "exceed", "success", "win", "advance", "climb"
    ]
    
    negative_words = [
        "fall", "drop", "crash", "plunge", "decline", "bearish", "pessimistic",
        "loss", "sink", "bust", "weak", "negative", "down", "lower",
        "miss", "fail", "lose", "retreat", "slip", "tumble", "warn"
    ]
    
    pos_count = sum(1 for word in positive_words if word in text_lower)
    neg_count = sum(1 for word in negative_words if word in text_lower)
    
    total = pos_count + neg_count
    if total == 0:
        return 0.0
    
    # Scale to -1 to +1
    score = (pos_count - neg_count) / total
    return round(score, 2)


def analyze_sentiment_snowflake(text: str) -> dict[str, Any]:
    """
    Analyze sentiment using Snowflake Cortex SENTIMENT function.
    Falls back to simple analysis if Snowflake unavailable.
    """
    if not SNOWFLAKE_ACCOUNT:
        # Use fallback
        score = analyze_sentiment_simple(text)
        return {
            "score": score,
            "provider": "fallback",
            "text": text,
        }
    
    try:
        # Try Snowflake Cortex REST API
        # The Cortex inference endpoint for sentiment
        url = f"https://{SNOWFLAKE_ACCOUNT}.snowflakecomputing.com/api/v2/cortex/inference:predict"
        
        token = _get_snowflake_token()
        if not token:
            # Fallback to simple analysis
            score = analyze_sentiment_simple(text)
            return {
                "score": score,
                "provider": "fallback",
                "text": text,
            }
        
        headers = {
            "Authorization": f"Snowflake Token=\"{token}\"",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        payload = {
            "model": "snowflake-arctic",
            "messages": [
                {
                    "role": "system",
                    "content": "You are a sentiment analyzer. Respond with ONLY a number between -1.0 (very negative) and 1.0 (very positive). No other text."
                },
                {
                    "role": "user",
                    "content": f"Analyze the sentiment of this headline: \"{text}\""
                }
            ],
            "temperature": 0.0,
            "max_tokens": 10,
        }
        
        response = requests.post(url, json=payload, headers=headers, timeout=30)
        
        if response.status_code == 200:
            result = response.json()
            content = result.get("choices", [{}])[0].get("message", {}).get("content", "0")
            try:
                score = float(content.strip())
                score = max(-1.0, min(1.0, score))  # Clamp to [-1, 1]
            except ValueError:
                score = analyze_sentiment_simple(text)
            
            return {
                "score": round(score, 2),
                "provider": "snowflake",
                "text": text,
            }
        else:
            logger.warning(f"Snowflake API error: {response.status_code}")
            score = analyze_sentiment_simple(text)
            return {
                "score": score,
                "provider": "fallback",
                "text": text,
            }
            
    except Exception as e:
        logger.error(f"Snowflake sentiment error: {e}")
        score = analyze_sentiment_simple(text)
        return {
            "score": score,
            "provider": "fallback",
            "text": text,
        }


def generate_sentiment_insight(
    avg_sentiment: float,
    precognition_prob: float,
    market_prob: float,
) -> str:
    """
    Generate an insight comparing public sentiment to SmartCrowd predictions.
    """
    # Determine sentiment label
    if avg_sentiment > 0.15:
        sentiment_label = "bullish"
    elif avg_sentiment < -0.15:
        sentiment_label = "bearish"
    else:
        sentiment_label = "neutral"
    
    # Determine SmartCrowd direction
    if precognition_prob > market_prob + 0.03:
        smartcrowd_label = "bullish"
    elif precognition_prob < market_prob - 0.03:
        smartcrowd_label = "bearish"
    else:
        smartcrowd_label = "neutral"
    
    # Generate insight based on divergence
    if sentiment_label == "bullish" and smartcrowd_label == "bearish":
        return "Public news is optimistic, but informed wallets are net selling. SmartCrowd may be fading retail hype."
    elif sentiment_label == "bearish" and smartcrowd_label == "bullish":
        return "Public news is pessimistic, but informed wallets are net buying. SmartCrowd may be buying the fear."
    elif sentiment_label == "bullish" and smartcrowd_label == "bullish":
        return "Both public sentiment and informed traders are bullish. Strong consensus signal."
    elif sentiment_label == "bearish" and smartcrowd_label == "bearish":
        return "Both public sentiment and informed traders are bearish. Strong consensus signal."
    else:
        return "Public sentiment is mixed. SmartCrowd signal is the primary indicator."


def get_sentiment_label(score: float) -> str:
    """Convert sentiment score to human-readable label."""
    if score > 0.3:
        return "Very Bullish"
    elif score > 0.15:
        return "Bullish"
    elif score > -0.15:
        return "Neutral"
    elif score > -0.3:
        return "Bearish"
    else:
        return "Very Bearish"
