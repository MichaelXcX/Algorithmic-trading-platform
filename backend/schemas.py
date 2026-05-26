from pydantic import BaseModel
from typing import List


class ForecastResponse(BaseModel):
    symbol: str
    historical_dates: List[str]
    historical_prices: List[float]
    forecast_dates: List[str]
    forecast_prices: List[float]


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
