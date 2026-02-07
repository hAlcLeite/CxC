# AI-Powered Divergence Explainer

Uses **Backboard.io** with **Google Gemini** to generate natural language explanations for market divergences.

## Overview

When a market has >3% divergence between Polymarket odds and Precognition predictions, users can click "🤖 Explain Divergence" to get an AI explanation of why informed traders might see something the market doesn't.

## Architecture

```
Frontend (React) → Backend (FastAPI) → Backboard.io → Google Gemini
```

Backboard.io acts as a unified AI gateway that:
- Routes requests to your Gemini API key (BYOK)
- Manages assistant/thread conversations
- Provides observability and logging

## API Endpoint

```
POST /markets/{market_id}/explain
```

**Response:**
```json
{
  "result": {
    "market_id": "abc123",
    "explanation": "The Precognition is 5% more bullish because...",
    "cached": false
  }
}
```

## Rate Limiting & Caching

| Protection | Value | Description |
|------------|-------|-------------|
| Rate Limit | 60s per market | Prevents spam |
| Cache TTL | 5 minutes | Reuses recent explanations |
| Max Cache | 100 entries | Memory-safe LRU eviction |

## Setup

1. **Get Backboard.io API key** from https://app.backboard.io
   - Add to `.env`: `BACKBOARD_API_KEY=espr_xxxxx`

2. **Add Gemini key to Backboard.io BYOK:**
   - Go to https://app.backboard.io → BYOK section
   - Click "Add" next to Google Gemini
   - Paste your `GEMINI_API_KEY`

3. **Restart backend**

## Tech Stack

| Component | Technology |
|-----------|------------|
| AI Gateway | Backboard.io |
| LLM | Google Gemini 2.0 Flash |
| Backend | FastAPI |
| Frontend | React + Next.js |

## Files

| File | Purpose |
|------|---------|
| `backend/app/services/backboard.py` | Backboard.io integration |
| `backend/app/api.py` | `/markets/{market_id}/explain` endpoint |
| `frontend/src/components/market/DivergenceExplainer.tsx` | UI component |

## API Authentication

Backboard.io uses `X-API-Key` header (not Bearer token):
```python
headers = {"X-API-Key": BACKBOARD_API_KEY}
```
