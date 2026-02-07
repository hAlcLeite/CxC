// API Response wrapper
export interface ApiResponse<T> {
  result: T;
}

// Screener types
export interface TopDriver {
  wallet: string;
  weight: number;
  belief: number;
  contribution: number;
}

export interface ScreenerMarket {
  market_id: string;
  question: string;
  category: string;
  end_time: string;
  snapshot_time: string;
  market_prob: number;
  smartcrowd_prob: number;
  divergence: number;
  confidence: number;
  disagreement: number;
  participation_quality: number;
  integrity_risk: number;
  active_wallets: number;
  top_drivers: TopDriver[];
}

export interface ScreenerResponse {
  count: number;
  markets: ScreenerMarket[];
}

// Market detail types
export interface MarketInfo {
  id: string;
  question: string;
  category: string;
  end_time: string;
  liquidity: number;
}

export interface LatestSnapshot {
  snapshot_time: string;
  market_prob: number;
  smartcrowd_prob: number;
  divergence: number;
  confidence: number;
  disagreement: number;
  participation_quality: number;
  integrity_risk: number;
  active_wallets: number;
  top_drivers: TopDriver[];
}

export interface TimeSeriesPoint {
  snapshot_time: string;
  market_prob: number;
  smartcrowd_prob: number;
  divergence: number;
  confidence: number;
}

export interface FlowSummary {
  net_yes_flow_size: number;
  trade_count: number;
}

export interface MarketDetailResponse {
  market: MarketInfo;
  latest_snapshot: LatestSnapshot;
  time_series: TimeSeriesPoint[];
  flow_summary: FlowSummary;
  explanation: string;
}

// Wallet types
export interface WalletMetric {
  wallet: string;
  category: string;
  horizon_bucket: string;
  trade_count: number;
  brier: number;
  calibration: number;
  roi: number;
  style_contrarian: number;
  style_early: number;
  style_concentrated: number;
}

export interface WalletWeight {
  wallet: string;
  category: string;
  horizon_bucket: string;
  weight: number;
  raw_weight: number;
  shrunk_weight: number;
}

export interface WalletRecentTrade {
  market_id: string;
  ts: string;
  side: string;
  action: string;
  price: number;
  size: number;
  question: string | null;
}

export interface WalletTradeSummary {
  trade_count: number;
  market_count: number;
  first_trade: string;
  last_trade: string;
  total_volume: number;
  avg_price: number;
  avg_size: number;
  recent_trades: WalletRecentTrade[];
}

export interface WalletDetailResponse {
  wallet: string;
  metrics: WalletMetric[];
  weights: WalletWeight[];
  trade_summary?: WalletTradeSummary;
}

// Alert types
export type AlertType =
  | "trusted_cohort_regime_shift"
  | "integrity_risk_spike"
  | "smartcrowd_crossed_market";

export interface Alert {
  type: AlertType;
  market_id: string;
  question: string;
  category: string;
  snapshot_time: string;
  detail: string;
}

export interface AlertsResponse {
  count: number;
  alerts: Alert[];
  by_type: Record<AlertType, Alert[]>;
}

// Backtest types
export interface EdgeBucket {
  bucket: string;
  count: number;
  avg_edge: number;
  avg_pnl: number;
  win_rate: number;
}

export interface BacktestSummary {
  run_id: string;
  cutoff_hours: number;
  evaluated_at: string;
  total_markets: number;
  smartcrowd_brier?: number;
  market_brier?: number;
  brier_improvement?: number;
  edge_buckets?: EdgeBucket[];
  note?: string;
}

// Pipeline types
export interface IngestParams {
  include_active_markets?: boolean;
  include_closed_markets?: boolean;
  active_markets_limit?: number;
  closed_markets_limit?: number;
  trades_per_market?: number;
  trade_page_size?: number;
  market_chunk_size?: number;
  taker_only?: boolean;
  min_trade_timestamp?: string;
  max_trade_timestamp?: string;
}

export interface RecomputeParams {
  snapshot_time?: string;
  include_resolved_snapshots?: boolean;
}

export interface IngestResult {
  source: string;
  ingest: Record<string, number>;
  pipeline: Record<string, number> | null;
  db_path: string;
}

export interface RecomputeResult {
  wallets_with_metrics: number;
  wallets_with_weights: number;
  snapshots_built: number;
}

export interface BacktestParams {
  cutoff_hours?: number;
  run_id?: string;
}
