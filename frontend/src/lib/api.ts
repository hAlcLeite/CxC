import type {
  ApiResponse,
  ScreenerResponse,
  MarketDetailResponse,
  WalletDetailResponse,
  AlertsResponse,
  BacktestSummary,
  IngestParams,
  RecomputeParams,
  IngestResult,
  RecomputeResult,
  BacktestParams,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || `API error: ${res.status}`);
  }

  return res.json();
}

// Screener
export async function fetchScreener(params?: {
  limit?: number;
  minConfidence?: number;
}): Promise<ScreenerResponse> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set("limit", String(params.limit));
  if (params?.minConfidence)
    searchParams.set("min_confidence", String(params.minConfidence));

  const query = searchParams.toString();
  const response = await fetchApi<ApiResponse<ScreenerResponse>>(
    `/screener${query ? `?${query}` : ""}`
  );
  return response.result;
}

// Market detail
export async function fetchMarket(
  marketId: string,
  historyPoints?: number
): Promise<MarketDetailResponse> {
  const query = historyPoints ? `?history_points=${historyPoints}` : "";
  const response = await fetchApi<ApiResponse<MarketDetailResponse>>(
    `/markets/${encodeURIComponent(marketId)}${query}`
  );
  return response.result;
}

// Explain divergence with AI
export async function explainDivergence(
  marketId: string
): Promise<{ market_id: string; explanation: string; cached: boolean }> {
  const response = await fetchApi<
    ApiResponse<{ market_id: string; explanation: string; cached: boolean }>
  >(`/markets/${encodeURIComponent(marketId)}/explain`, {
    method: "POST",
  });
  return response.result;
}

// Sentiment response type
export interface SentimentHeadline {
  text: string;
  sentiment: number;
  published: string;
  link: string;
}

export interface SentimentResponse {
  market_id: string;
  topic: string;
  headlines: SentimentHeadline[];
  avg_sentiment: number;
  sentiment_label: string;
  precognition_prob: number;
  market_prob: number;
  insight: string;
  cached: boolean;
  provider: string;
}

// Fetch public sentiment analysis for a market (powered by Snowflake Cortex)
export async function fetchMarketSentiment(
  marketId: string
): Promise<SentimentResponse> {
  const response = await fetchApi<ApiResponse<SentimentResponse>>(
    `/markets/${encodeURIComponent(marketId)}/sentiment`
  );
  return response.result;
}

// Wallet detail
export async function fetchWallet(wallet: string): Promise<WalletDetailResponse> {
  const response = await fetchApi<ApiResponse<WalletDetailResponse>>(
    `/wallets/${encodeURIComponent(wallet)}`
  );
  return response.result;
}

// Alerts
export async function fetchAlerts(params?: {
  divergenceThreshold?: number;
  integrityRiskThreshold?: number;
  minConfidence?: number;
}): Promise<AlertsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.divergenceThreshold)
    searchParams.set("divergence_threshold", String(params.divergenceThreshold));
  if (params?.integrityRiskThreshold)
    searchParams.set(
      "integrity_risk_threshold",
      String(params.integrityRiskThreshold)
    );
  if (params?.minConfidence != null) {
    searchParams.set("min_confidence", String(params.minConfidence));
  }

  const query = searchParams.toString();
  const response = await fetchApi<ApiResponse<AlertsResponse>>(
    `/alerts${query ? `?${query}` : ""}`
  );
  return response.result;
}

// Backtest
export async function fetchBacktest(runId: string): Promise<BacktestSummary> {
  const response = await fetchApi<ApiResponse<BacktestSummary>>(
    `/backtest/${encodeURIComponent(runId)}`
  );
  return response.result;
}

export async function runBacktest(
  params?: BacktestParams
): Promise<BacktestSummary> {
  const response = await fetchApi<ApiResponse<BacktestSummary>>("/backtest", {
    method: "POST",
    body: JSON.stringify(params || {}),
  });
  return response.result;
}

// Pipeline
export async function ingestPolymarket(
  params?: IngestParams,
  runRecompute = true
): Promise<IngestResult> {
  const query = runRecompute ? "?run_recompute=true" : "?run_recompute=false";
  const response = await fetchApi<ApiResponse<IngestResult>>(
    `/ingest/polymarket${query}`,
    {
      method: "POST",
      body: JSON.stringify(params || {}),
    }
  );
  return response.result;
}

export async function recomputePipeline(
  params?: RecomputeParams
): Promise<RecomputeResult> {
  const response = await fetchApi<ApiResponse<RecomputeResult>>(
    "/pipeline/recompute",
    {
      method: "POST",
      body: JSON.stringify(params || {}),
    }
  );
  return response.result;
}

// Health check
export async function checkHealth(): Promise<{ status: string }> {
  return fetchApi<{ status: string }>("/health");
}
