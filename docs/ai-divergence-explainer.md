# AI-Powered Divergence Explainer

Uses **Google Gemini** directly to generate natural language explanations for market divergences.

## Overview

When a market has >3% divergence between Polymarket odds and SmartCrowd predictions, users can click "🤖 Explain Divergence" to get an AI explanation of why informed traders might see something the market doesn't.

## API Endpoint

```
POST /markets/{market_id}/explain
```

**Response:**
```json
{
  "result": {
    "market_id": "abc123",
    "explanation": "The SmartCrowd is 5% more bullish because...",
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

1. Add your Gemini API key to root `.env`:
   ```
   GEMINI_API_KEY=your_key_here
   ```
2. Restart backend

## Tech Stack

- **AI Provider**: Google Gemini 2.0 Flash (direct API)
- **Backend**: FastAPI endpoint at `/markets/{market_id}/explain`
- **Frontend**: React component `DivergenceExplainer.tsx`

## Files

| File | Purpose |
|------|---------|
| `backend/app/services/backboard.py` | Gemini API integration with rate limiting |
| `backend/app/api.py` | `/markets/{market_id}/explain` endpoint |
| `frontend/src/components/market/DivergenceExplainer.tsx` | UI component |
