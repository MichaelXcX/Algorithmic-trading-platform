from pydantic import BaseModel
from typing import List, Optional


class ForecastResponse(BaseModel):
    symbol: str
    historical_dates: List[str]
    historical_prices: List[float]
    forecast_dates: List[str]
    forecast_prices: List[float]


class RegimeStateResponse(BaseModel):
    current_state: int
    state_name: str
    state_probs: List[float]
    transition_matrix: List[List[float]]


class LSTMForecastResponse(BaseModel):
    symbol: str
    mean_return: float
    log_sigma: float
    uncertainty: float
    regime_state: int
    regime_name: str


class LSTMForecastPerAsset(BaseModel):
    mu: float
    uncertainty: float


class PortfolioRequest(BaseModel):
    symbols: List[str]
    period: str = "2y"


class PortfolioAllocationResponse(BaseModel):
    symbols: List[str]
    weights: List[float]
    lstm_forecasts: dict
    regime_state: int
    regime_name: str
    timestamp: str


class TrainRequest(BaseModel):
    symbols: List[str]
    epochs_per_fold: int = 10


class TrainResponse(BaseModel):
    symbols: List[str]
    folds_completed: int
    history: List[dict]


# ── Alpaca ────────────────────────────────────────────────────────────────────

class AlpacaStatusResponse(BaseModel):
    configured: bool
    paper: bool


class AlpacaAccountResponse(BaseModel):
    equity: float
    last_equity: float
    day_pl: float
    day_plpc: float
    buying_power: float
    cash: float
    portfolio_value: float
    status: str
    paper: bool


class AlpacaPosition(BaseModel):
    symbol: str
    qty: float
    side: str
    avg_entry_price: float
    current_price: float
    market_value: float
    cost_basis: float
    unrealized_pl: float
    unrealized_plpc: float
    change_today: float


class AlpacaSeedRequest(BaseModel):
    symbols: List[str] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'JPM', 'JNJ', 'XOM', 'META', 'TSLA']
    use_fraction: float = 0.9
    weights: Optional[List[float]] = None  # if None, equal weight


class AlpacaSeedOrderResult(BaseModel):
    symbol: str
    notional: float
    order_id: str
    status: str


class AlpacaSeedOrderError(BaseModel):
    symbol: str
    error: str


class AlpacaSeedResponse(BaseModel):
    orders: List[AlpacaSeedOrderResult]
    errors: List[AlpacaSeedOrderError]
    total_deployed: float
    buying_power_before: float


class AlpacaHistoryResponse(BaseModel):
    timestamps: List[str]
    equity: List[float | None]
    profit_loss: List[float | None]
    profit_loss_pct: List[float | None]
    base_value: float


class HMMFitRequest(BaseModel):
    symbols: List[str]

class HMMStatusResponse(BaseModel):
    fitted: bool
    running: bool
    n_features: int | None
    error: str | None
# ── Signal Classifier ─────────────────────────────────────────────────────────

class TechnicalIndicators(BaseModel):
    rsi: float
    macd: float
    macd_signal: float
    sma20: float
    sma50: float
    bb_upper: float
    bb_lower: float
    volume_ratio: float


class RecentSignalPoint(BaseModel):
    date: str
    close_price: float
    signal: str
    confidence: float


class FeatureImportance(BaseModel):
    feature: str
    importance: float


class SignalResponse(BaseModel):
    symbol: str
    current_signal: str
    confidence: float
    feature_importances: List[FeatureImportance]
    recent_signals: List[RecentSignalPoint]
    technical_indicators: TechnicalIndicators
    model_accuracy: float


# ── Strategy Selector ─────────────────────────────────────────────────────────

class StrategyScore(BaseModel):
    strategy: str
    score: float
    description: str


class MarketConditions(BaseModel):
    volatility: float
    trend_strength: float
    momentum: float
    regime: str


class BacktestResult(BaseModel):
    strategy: str
    total_return: float
    sharpe_ratio: float
    win_rate: float
    max_drawdown: float


class StrategyResponse(BaseModel):
    symbol: str
    recommended_strategy: str
    strategy_scores: List[StrategyScore]
    market_conditions: MarketConditions
    backtest_results: List[BacktestResult]
