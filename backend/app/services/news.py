"""
Google News RSS fetcher for public sentiment analysis.

Fetches recent news headlines related to prediction market topics
using Google News RSS feed (free, no API key required).

Includes relevance filtering to ensure headlines match the market question.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import quote_plus

import feedparser

logger = logging.getLogger("smartcrowd.news")


def extract_topic_from_question(question: str) -> str:
    """
    Extract a searchable news topic from a prediction market question.
    Uses the full question context for better Google News results.
    """
    question_lower = question.lower()
    
    # Crypto markets - specific searches
    if "bitcoin" in question_lower or "btc" in question_lower:
        return "Bitcoin price prediction"
    if "ethereum" in question_lower or "eth" in question_lower:
        return "Ethereum price prediction"
    if "crypto" in question_lower:
        return "cryptocurrency market"
    
    # Federal Reserve / Interest rates
    if "fed" in question_lower or "federal reserve" in question_lower:
        if "rate" in question_lower:
            return "Federal Reserve interest rate decision"
        return "Federal Reserve policy"
    
    # Elections / Politics - extract names
    if "trump" in question_lower:
        # Extract what specifically about Trump
        if "deport" in question_lower:
            return "Trump deportation policy"
        if "tariff" in question_lower:
            return "Trump tariff"
        if "election" in question_lower:
            return "Trump election"
        return "Donald Trump latest"
    
    if "biden" in question_lower:
        return "Biden administration"
    
    # Sports - try to extract team/player names
    sports_keywords = ["win", "championship", "finals", "super bowl", "nba", "nfl", "mlb"]
    for keyword in sports_keywords:
        if keyword in question_lower:
            words = question.split()
            proper_nouns = [w for w in words if w[0].isupper() and len(w) > 2]
            if proper_nouns:
                return " ".join(proper_nouns[:3])
    
    # Economic indicators
    if "gdp" in question_lower:
        return "GDP economic growth forecast"
    if "inflation" in question_lower:
        return "inflation rate forecast"
    if "unemployment" in question_lower:
        return "unemployment rate"
    
    # Default: Use quoted search for the main topic
    # Extract the core subject from the question
    stopwords = {
        "will", "the", "be", "by", "in", "on", "at", "to", "of", "a", "an",
        "and", "or", "is", "are", "was", "were", "has", "have", "had",
        "this", "that", "these", "those", "what", "when", "where", "who",
        "which", "how", "why", "before", "after", "during", "until",
        "yes", "no", "more", "less", "than", "least", "most"
    }
    
    # Clean and tokenize
    clean_question = re.sub(r'[^\\w\\s]', ' ', question)
    words = clean_question.split()
    
    # Keep meaningful words, prioritize proper nouns (capitalized)
    proper_nouns = [w for w in words if w[0].isupper() and w.lower() not in stopwords and len(w) > 2]
    other_words = [w for w in words if w.lower() not in stopwords and len(w) > 2 and w not in proper_nouns]
    
    # Combine proper nouns first, then other meaningful words
    meaningful = proper_nouns + other_words
    
    if meaningful:
        # Use first 3-5 meaningful words as the search topic
        return " ".join(meaningful[:5])
    
    # Last resort
    return " ".join(question.split()[:4])


def calculate_relevance_score(headline: str, question: str) -> float:
    """
    Calculate how relevant a headline is to the market question.
    Returns a score from 0.0 (not relevant) to 1.0 (very relevant).
    """
    headline_lower = headline.lower()
    question_lower = question.lower()
    
    # Extract keywords from both
    stopwords = {
        "will", "the", "be", "by", "in", "on", "at", "to", "of", "a", "an",
        "and", "or", "is", "are", "was", "were", "has", "have", "had",
        "this", "that", "these", "those", "what", "when", "where", "who",
        "which", "how", "why", "for", "from", "with", "says", "said"
    }
    
    # Get keywords from question
    question_clean = re.sub(r'[^\\w\\s]', ' ', question_lower)
    question_keywords = {w for w in question_clean.split() if w not in stopwords and len(w) > 2}
    
    # Get keywords from headline
    headline_clean = re.sub(r'[^\\w\\s]', ' ', headline_lower)
    headline_keywords = {w for w in headline_clean.split() if w not in stopwords and len(w) > 2}
    
    if not question_keywords:
        return 0.5  # Can't calculate, assume moderate relevance
    
    # Calculate overlap
    matches = question_keywords.intersection(headline_keywords)
    score = len(matches) / len(question_keywords)
    
    # Bonus for proper noun matches (names, places)
    question_proper = re.findall(r'\\b[A-Z][a-z]+\\b', question)
    headline_proper = re.findall(r'\\b[A-Z][a-z]+\\b', headline)
    proper_matches = set(question_proper).intersection(set(headline_proper))
    if proper_matches:
        score += 0.3 * len(proper_matches)
    
    return min(score, 1.0)


def get_news_headlines(topic: str, limit: int = 5, question: str = "") -> list[dict]:
    """
    Fetch recent news headlines for a topic from Google News RSS.
    Filters by relevance if a question is provided.
    
    Args:
        topic: The search topic derived from the question
        limit: Maximum number of headlines to return
        question: Original market question for relevance filtering
        
    Returns:
        List of dicts with 'title', 'link', 'published' keys
    """
    try:
        # Use quoted search for better precision
        encoded_topic = quote_plus(f'"{topic}"')
        url = f"https://news.google.com/rss/search?q={encoded_topic}&hl=en-US&gl=US&ceid=US:en"
        
        logger.info(f"Fetching news for topic: {topic}")
        
        # Parse the RSS feed
        feed = feedparser.parse(url)
        
        if feed.bozo:
            logger.warning(f"Feed parsing issue: {feed.bozo_exception}")
        
        # If no results with quotes, try without
        if len(feed.entries) == 0:
            encoded_topic = quote_plus(topic)
            url = f"https://news.google.com/rss/search?q={encoded_topic}&hl=en-US&gl=US&ceid=US:en"
            feed = feedparser.parse(url)
        
        candidates = []
        for entry in feed.entries[:15]:  # Get more candidates to filter
            # Clean up the title (remove source suffix like " - CNN")
            title = entry.title
            if " - " in title:
                title = title.rsplit(" - ", 1)[0]
            
            headline_data = {
                "title": title,
                "link": entry.get("link", ""),
                "published": entry.get("published", ""),
            }
            
            # Calculate relevance if question provided
            if question:
                relevance = calculate_relevance_score(title, question)
                headline_data["relevance"] = relevance
            else:
                headline_data["relevance"] = 0.5  # Default moderate relevance
            
            candidates.append(headline_data)
        
        # Filter by relevance threshold and sort
        MIN_RELEVANCE = 0.15  # At least some keyword overlap required
        relevant_headlines = [h for h in candidates if h["relevance"] >= MIN_RELEVANCE]
        
        # Sort by relevance (highest first)
        relevant_headlines.sort(key=lambda x: x["relevance"], reverse=True)
        
        # Take top results up to limit
        headlines = relevant_headlines[:limit]
        
        # Remove relevance field from output (internal use only)
        for h in headlines:
            h.pop("relevance", None)
        
        logger.info(f"Found {len(headlines)} relevant headlines for '{topic}' (filtered from {len(candidates)})")
        return headlines
        
    except Exception as e:
        logger.error(f"Error fetching news for '{topic}': {e}")
        return []


def format_headlines_for_display(headlines: list[dict]) -> list[str]:
    """Format headlines for simple text display."""
    return [h["title"] for h in headlines]
