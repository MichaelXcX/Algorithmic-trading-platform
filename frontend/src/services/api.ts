const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function get<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = new URL(path, BASE_URL)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

async function del<T>(path: string): Promise<T> {
  const url = new URL(path, BASE_URL)
  const res = await fetch(url.toString(), { method: 'DELETE' })
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
  getSentiment: (ticker: string) => get<NewsSentimentResponse>('/news/sentiment', { ticker }),
}

// ── Regime ────────────────────────────────────────────────────────────────────

export type RegimeName = 'bull' | 'bear' | 'sideways'

export interface RegimeStateResponse {
  current_state: number
  state_name: RegimeName
  state_probs: number[]
  transition_matrix: number[][]
}

export const regimeApi = {
  getState: (symbols: string[]) =>
    get<RegimeStateResponse>('/regime', { symbols: symbols.join(',') }),
}

// ── Linear regression forecast ────────────────────────────────────────────────

export interface LinearForecastResponse {
  symbol: string
  historical_dates: string[]
  historical_prices: number[]
  forecast_dates: string[]
  forecast_prices: number[]
}

export const forecastApi = {
  getForecast: (symbol: string) =>
    get<LinearForecastResponse>(`/forecast/${encodeURIComponent(symbol)}`),
}

// ── LSTM forecast ─────────────────────────────────────────────────────────────

export interface LSTMForecastResponse {
  symbol: string
  mean_return: number
  log_sigma: number
  uncertainty: number
  regime_state: number
  regime_name: RegimeName
}

export const lstmApi = {
  getForecast: (symbol: string, nSamples = 30) =>
    get<LSTMForecastResponse>(`/forecast/lstm/${encodeURIComponent(symbol)}`, {
      n_samples: String(nSamples),
    }),
}

// ── Portfolio (GNN) ───────────────────────────────────────────────────────────

export interface AssetForecast {
  mu: number
  uncertainty: number
}

export interface PortfolioAllocationResponse {
  symbols: string[]
  weights: number[]
  lstm_forecasts: Record<string, AssetForecast>
  regime_state: number
  regime_name: RegimeName
  timestamp: string
}

export interface TrainingStatusResponse {
  running: boolean
  last_result: {
    symbols: string[]
    folds_completed: number
    history: Array<{ fold: number; regime: string; train_loss: number; val_loss: number }>
  } | null
}

export const portfolioApi = {
  optimize: (symbols: string[]) =>
    post<PortfolioAllocationResponse>('/portfolio/optimize', { symbols }),
  startTraining: (symbols: string[], epochsPerFold = 10) =>
    post<{ status: string; symbols: string[] }>('/portfolio/train', {
      symbols,
      epochs_per_fold: epochsPerFold,
    }),
  getTrainingStatus: () => get<TrainingStatusResponse>('/portfolio/train/status'),
}

// ── Alpaca ────────────────────────────────────────────────────────────────────

export interface AlpacaStatus {
  configured: boolean
  paper: boolean
}

export interface AlpacaAccount {
  equity: number
  last_equity: number
  day_pl: number
  day_plpc: number
  buying_power: number
  cash: number
  portfolio_value: number
  status: string
  paper: boolean
}

export interface AlpacaPosition {
  symbol: string
  qty: number
  side: string
  avg_entry_price: number
  current_price: number
  market_value: number
  cost_basis: number
  unrealized_pl: number
  unrealized_plpc: number
  change_today: number
}

export interface AlpacaHistory {
  timestamps: string[]
  equity: (number | null)[]
  profit_loss: (number | null)[]
  profit_loss_pct: (number | null)[]
  base_value: number
}

export interface AlpacaSeedOrder {
  symbol: string
  notional: number
  order_id: string
  status: string
}

export interface AlpacaSeedError {
  symbol: string
  error: string
}

export interface AlpacaSeedResult {
  orders: AlpacaSeedOrder[]
  errors: AlpacaSeedError[]
  total_deployed: number
  buying_power_before: number
}

export const SEED_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'JPM', 'JNJ', 'XOM', 'META', 'TSLA']

// European blue-chips with US listings (ADRs / direct NYSE-NASDAQ listings)
export const EUROPE_SEED_SYMBOLS = ['ASML', 'SAP', 'AZN', 'NVS', 'SHEL', 'TTE', 'RIO', 'UL', 'GSK', 'BP']

// ── S&P 500 universe ──────────────────────────────────────────────────────────

export interface Sp500Stock {
  ticker: string
  name: string
}

export type Sp500Sectors = Record<string, Sp500Stock[]>

export const stocksApi = {
  getSp500Sectors: () => get<Sp500Sectors>('/stocks/sp500/sectors'),
}

export const alpacaApi = {
  getStatus: () => get<AlpacaStatus>('/alpaca/status'),
  getAccount: () => get<AlpacaAccount>('/alpaca/account'),
  getPositions: () => get<AlpacaPosition[]>('/alpaca/positions'),
  getHistory: (period = '1M') => get<AlpacaHistory>('/alpaca/history', { period }),
  seed: (symbols = SEED_SYMBOLS, use_fraction = 0.9, weights?: number[]) =>
    post<AlpacaSeedResult>('/alpaca/seed', { symbols, use_fraction, ...(weights ? { weights } : {}) }),
  liquidate: () => del<{ status: string }>('/alpaca/positions'),
}

// ── HMM ───────────────────────────────────────────────────────────────────────

export interface HMMStatus {
  fitted: boolean
  running: boolean
  n_features: number | null
  error: string | null
}

export const hmmApi = {
  fit: (symbols: string[]) =>
    post<{ status: string; symbols: string[] }>('/hmm/fit', { symbols }),
  getStatus: () => get<HMMStatus>('/hmm/fit/status'),
}

// ── MLflow ────────────────────────────────────────────────────────────────────

export interface MLflowRun {
  run_id: string
  run_name: string
  status: string
  start_time: number | null
  end_time: number | null
  params: Record<string, string>
  metrics: Record<string, number>
}

export interface MLflowMetricPoint {
  step: number
  value: number
}

export const mlflowApi = {
  getRuns: (n = 20) => get<MLflowRun[]>('/mlflow/runs', { n: String(n) }),
  getRunHistory: (runId: string, metric: string) =>
    get<MLflowMetricPoint[]>(`/mlflow/runs/${encodeURIComponent(runId)}/history`, { metric }),
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
  getSignal: (symbol: string) => get<SignalResponse>(`/signal/${encodeURIComponent(symbol)}`),
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
    get<StrategyResponse>(`/strategy/${encodeURIComponent(symbol)}`),
}
