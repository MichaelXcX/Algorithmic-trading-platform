const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── News ──────────────────────────────────────────────────────────────────────

export interface Article {
  title: string
  description: string
  url: string
  source: string | null
  publishedAt: string
  urlToImage: string | null
  sentiment: 'positive' | 'negative' | 'neutral'
  compound: number
  positive: number
  negative: number
  neutral: number
}

export interface NewsSentimentResponse {
  ticker: string
  total: number
  articles: Article[]
}

export const newsApi = {
  getSentiment: (ticker: string) =>
    request<NewsSentimentResponse>('/news/sentiment', { ticker }),
}

// ── Signal Classifier ─────────────────────────────────────────────────────────

export interface TechnicalIndicators {
  rsi: number
  macd: number
  macd_signal: number
  sma20: number
  sma50: number
  bb_upper: number
  bb_lower: number
  volume_ratio: number
}

export interface RecentSignalPoint {
  date: string
  close_price: number
  signal: string
  confidence: number
}

export interface FeatureImportance {
  feature: string
  importance: number
}

export interface SignalResponse {
  symbol: string
  current_signal: string
  confidence: number
  feature_importances: FeatureImportance[]
  recent_signals: RecentSignalPoint[]
  technical_indicators: TechnicalIndicators
  model_accuracy: number
}

export const signalApi = {
  getSignal: (symbol: string) => request<SignalResponse>(`/signal/${encodeURIComponent(symbol)}`),
}

// ── Strategy Selector ─────────────────────────────────────────────────────────

export interface StrategyScore {
  strategy: string
  score: number
  description: string
}

export interface MarketConditions {
  volatility: number
  trend_strength: number
  momentum: number
  regime: string
}

export interface BacktestResult {
  strategy: string
  total_return: number
  sharpe_ratio: number
  win_rate: number
  max_drawdown: number
}

export interface StrategyResponse {
  symbol: string
  recommended_strategy: string
  strategy_scores: StrategyScore[]
  market_conditions: MarketConditions
  backtest_results: BacktestResult[]
}

export const strategyApi = {
  getStrategy: (symbol: string) =>
    request<StrategyResponse>(`/strategy/${encodeURIComponent(symbol)}`),
}
