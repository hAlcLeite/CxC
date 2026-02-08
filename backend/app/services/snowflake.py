"""
Snowflake Cortex sentiment analysis via SQL connector.

Uses Snowflake's CORTEX.SENTIMENT function through SQL queries
instead of REST API (which requires OAuth that trial accounts don't have).
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from typing import Any

logger = logging.getLogger("smartcrowd.snowflake")

# Snowflake configuration from environment
SNOWFLAKE_ACCOUNT = os.getenv("SNOWFLAKE_ACCOUNT", "")
SNOWFLAKE_USER = os.getenv("SNOWFLAKE_USER", "")
SNOWFLAKE_PASSWORD = os.getenv("SNOWFLAKE_PASSWORD", "")
SNOWFLAKE_WAREHOUSE = os.getenv("SNOWFLAKE_WAREHOUSE", "COMPUTE_WH")
SNOWFLAKE_DATABASE = os.getenv("SNOWFLAKE_DATABASE", "SNOWFLAKE_SAMPLE_DATA")
SNOWFLAKE_SCHEMA = os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC")

# Rate limiting
_last_call_times: dict[str, float] = {}
_MIN_INTERVAL_SECONDS = 30

# Simple in-memory cache
_sentiment_cache: dict[str, tuple[dict, float]] = {}
_CACHE_TTL_SECONDS = 900  # 15 minutes

# Connection pool (reuse connections)
_snowflake_connection = None


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
    if len(_sentiment_cache) > 100:
        sorted_keys = sorted(
            _sentiment_cache.keys(),
            key=lambda k: _sentiment_cache[k][1]
        )
        for key in sorted_keys[:20]:
            del _sentiment_cache[key]


def _get_snowflake_connection():
    """Get or create a Snowflake connection."""
    global _snowflake_connection
    
    if not SNOWFLAKE_ACCOUNT or not SNOWFLAKE_USER or not SNOWFLAKE_PASSWORD:
        logger.warning("Snowflake credentials not configured")
        return None
    
    # Check if existing connection is still valid
    if _snowflake_connection is not None:
        try:
            _snowflake_connection.cursor().execute("SELECT 1")
            return _snowflake_connection
        except Exception:
            _snowflake_connection = None
    
    try:
        import snowflake.connector
        
        logger.info("Creating Snowflake connection...")
        _snowflake_connection = snowflake.connector.connect(
            account=SNOWFLAKE_ACCOUNT,
            user=SNOWFLAKE_USER,
            password=SNOWFLAKE_PASSWORD,
            warehouse=SNOWFLAKE_WAREHOUSE,
            database=SNOWFLAKE_DATABASE,
            schema=SNOWFLAKE_SCHEMA,
        )
        logger.info("Snowflake connection established")
        return _snowflake_connection
        
    except ImportError:
        logger.error("snowflake-connector-python not installed")
        return None
    except Exception as e:
        logger.error(f"Snowflake connection failed: {e}")
        return None


def analyze_sentiment_simple(text: str) -> float:
    """
    Simple rule-based sentiment as fallback.
    Returns score from -1 (negative) to +1 (positive).
    """
    text_lower = text.lower()
    
    positive_words = [
        "rally", "surge", "rise", "jump", "gain", "bullish", "optimistic",
        "growth", "soar", "boom", "strong", "positive", "up", "higher",
        "beat", "exceed", "success", "win", "advance", "climb", "support"
    ]
    
    negative_words = [
        "fall", "drop", "crash", "plunge", "decline", "bearish", "pessimistic",
        "loss", "sink", "bust", "weak", "negative", "down", "lower", "warn",
        "miss", "fail", "lose", "retreat", "slip", "tumble", "blame", "refuse",
        "controversy", "scandal", "attack", "crisis", "fear", "concern", "threat",
        "racist", "bomb", "heat", "risk", "danger", "arrest", "investigation"
    ]
    
    pos_count = sum(1 for word in positive_words if word in text_lower)
    neg_count = sum(1 for word in negative_words if word in text_lower)
    
    total = pos_count + neg_count
    if total == 0:
        return 0.0
    
    score = (pos_count - neg_count) / total
    return round(score, 2)


def analyze_sentiment_snowflake(text: str) -> dict[str, Any]:
    """
    Analyze sentiment using Snowflake Cortex SENTIMENT function via SQL.
    Falls back to simple analysis if Snowflake unavailable.
    """
    conn = _get_snowflake_connection()
    
    if conn is None:
        # Use fallback
        score = analyze_sentiment_simple(text)
        return {
            "score": score,
            "provider": "fallback",
            "text": text,
        }
    
    try:
        cursor = conn.cursor()
        
        # Escape single quotes in text for SQL
        safe_text = text.replace("'", "''")
        
        # Call Snowflake Cortex SENTIMENT function
        query = f"SELECT SNOWFLAKE.CORTEX.SENTIMENT('{safe_text}')"
        
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result and result[0] is not None:
            score = float(result[0])
            # Clamp to [-1, 1]
            score = max(-1.0, min(1.0, score))
            
            logger.info(f"Snowflake sentiment: '{text[:50]}...' → {score:.2f}")
            
            return {
                "score": round(score, 2),
                "provider": "snowflake",
                "text": text,
            }
        else:
            # Fallback if no result
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
    if avg_sentiment > 0.15:
        sentiment_label = "bullish"
    elif avg_sentiment < -0.15:
        sentiment_label = "bearish"
    else:
        sentiment_label = "neutral"
    
    if precognition_prob > market_prob + 0.03:
        smartcrowd_label = "bullish"
    elif precognition_prob < market_prob - 0.03:
        smartcrowd_label = "bearish"
    else:
        smartcrowd_label = "neutral"
    
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


def check_headline_relevance(headline: str, question: str) -> bool:
    """
    Use Snowflake Cortex LLM to check if a headline is relevant to a market question.
    Returns True if relevant, False otherwise.
    """
    conn = _get_snowflake_connection()
    
    if conn is None:
        # If no Snowflake connection, assume relevant (fallback to keyword matching elsewhere)
        return True
    
    try:
        cursor = conn.cursor()
        
        # Escape quotes for SQL
        safe_headline = headline.replace("'", "''")
        safe_question = question.replace("'", "''")
        
        # Use Cortex COMPLETE to check relevance
        prompt = f"""Determine if this news headline is relevant to the prediction market question.

Question: {safe_question}
Headline: {safe_headline}

A headline is relevant if it discusses the same topic, people, events, or subject matter as the question.
Respond with ONLY 'YES' or 'NO'."""

        query = f"SELECT SNOWFLAKE.CORTEX.COMPLETE('mistral-large2', '{prompt}')"
        
        cursor.execute(query)
        result = cursor.fetchone()
        
        if result and result[0]:
            answer = result[0].strip().upper()
            is_relevant = answer.startswith("YES")
            
            logger.info(f"Relevance check: '{headline[:40]}...' → {'YES' if is_relevant else 'NO'}")
            return is_relevant
        
        return True  # Default to relevant if unclear
        
    except Exception as e:
        logger.error(f"Relevance check error: {e}")
        return True  # Default to relevant on error

