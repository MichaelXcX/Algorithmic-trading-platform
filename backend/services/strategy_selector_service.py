import warnings

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

STRATEGIES = [
    "Trend Following",
    "Mean Reversion",
    "Momentum",
    "Breakout",
    "Defensive",
]

STRATEGY_DESCRIPTIONS = {
    "Trend Following": "Follows established price trends using SMA crossovers. Best in strongly trending markets.",
    "Mean Reversion": "Exploits price extremes using RSI and Bollinger Bands. Best in range-bound sideways markets.",
    "Momentum": "Rides short-term price momentum signals. Best when recent performance is strong and consistent.",
    "Breakout": "Captures large price moves when volatility expands. Best when markets approach key breakout levels.",
    "Defensive": "Minimizes exposure to protect capital. Best in high-volatility or declining market regimes.",
}


def _to_series(col: "pd.Series | pd.DataFrame") -> pd.Series:
    if isinstance(col, pd.DataFrame):
        return col.iloc[:, 0]
    return col


def _compute_rsi(prices: pd.Series, period: int = 14) -> pd.Series:
    delta = prices.diff()
    gain = delta.clip(lower=0).ewm(com=period - 1, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(com=period - 1, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _compute_market_features(close: pd.Series) -> pd.Series:
    """Compute 6 market condition features from a price series."""
    ret = close.pct_change().dropna()

    volatility = float(ret.std() * np.sqrt(252)) if len(ret) > 1 else 0.0

    sma20 = close.rolling(20, min_periods=1).mean()
    sma50 = close.rolling(50, min_periods=1).mean()

    if len(close) >= 20 and sma20.iloc[-20] > 0:
        trend_slope = float((sma20.iloc[-1] - sma20.iloc[-20]) / sma20.iloc[-20])
    else:
        trend_slope = 0.0

    sma_cross = float((sma20.iloc[-1] - sma50.iloc[-1]) / sma50.iloc[-1]) if sma50.iloc[-1] > 0 else 0.0

    momentum = float(close.iloc[-1] / close.iloc[-min(20, len(close))] - 1) if len(close) > 1 else 0.0

    std20 = close.rolling(20, min_periods=1).std()
    bb_width = 4 * std20 / sma20.replace(0, np.nan)
    bb_w = bb_width.dropna()
    if len(bb_w) >= 5:
        bb_width_chg = float((bb_w.iloc[-1] - bb_w.iloc[-5]) / (bb_w.iloc[-5] + 1e-8))
    else:
        bb_width_chg = 0.0

    rsi_val = _compute_rsi(close).dropna()
    rsi = float(rsi_val.iloc[-1]) if not rsi_val.empty else 50.0

    return pd.Series(
        {
            "volatility": volatility,
            "trend_slope": trend_slope,
            "sma_cross": sma_cross,
            "momentum": momentum,
            "bb_width_chg": bb_width_chg,
            "rsi": rsi,
        }
    )


def _simulate_strategy_return(close: pd.Series, strategy: str) -> float:
    """Compute total return for a strategy over the given price series."""
    daily_ret = close.pct_change().fillna(0)

    if strategy == "Trend Following":
        sma20 = close.rolling(20, min_periods=1).mean()
        sma50 = close.rolling(50, min_periods=1).mean()
        position = ((sma20 > sma50).astype(float) * 2 - 1).shift(1).fillna(0)

    elif strategy == "Mean Reversion":
        rsi = _compute_rsi(close)
        position = pd.Series(0.0, index=close.index)
        position[rsi < 35] = 1.0
        position[rsi > 65] = -0.8
        position = position.shift(1).fillna(0)

    elif strategy == "Momentum":
        mom10 = close.pct_change(min(10, len(close) - 1))
        position = ((mom10 > 0).astype(float) * 2 - 1).shift(1).fillna(0)

    elif strategy == "Breakout":
        high20 = close.rolling(20, min_periods=1).max()
        low20 = close.rolling(20, min_periods=1).min()
        position = pd.Series(0.3, index=close.index)
        position[close >= high20] = 1.0
        position[close <= low20] = -1.0
        position = position.shift(1).fillna(0)

    else:  # Defensive
        position = pd.Series(0.2, index=close.index)

    strategy_ret = (daily_ret * position).dropna()
    return float((1 + strategy_ret).prod() - 1)


def _backtest_strategy(close: pd.Series, strategy: str, lookback: int = 90) -> dict:
    """Full backtest metrics for one strategy over the last `lookback` trading days."""
    slice_close = close.tail(lookback + 60).copy().reset_index(drop=True)
    daily_ret = slice_close.pct_change().fillna(0)

    if strategy == "Trend Following":
        sma20 = slice_close.rolling(20, min_periods=1).mean()
        sma50 = slice_close.rolling(50, min_periods=1).mean()
        position = ((sma20 > sma50).astype(float) * 2 - 1).shift(1).fillna(0)

    elif strategy == "Mean Reversion":
        rsi = _compute_rsi(slice_close)
        position = pd.Series(0.0, index=slice_close.index)
        position[rsi < 35] = 1.0
        position[rsi > 65] = -0.8
        position = position.shift(1).fillna(0)

    elif strategy == "Momentum":
        mom10 = slice_close.pct_change(min(10, len(slice_close) - 1))
        position = ((mom10 > 0).astype(float) * 2 - 1).shift(1).fillna(0)

    elif strategy == "Breakout":
        high20 = slice_close.rolling(20, min_periods=1).max()
        low20 = slice_close.rolling(20, min_periods=1).min()
        position = pd.Series(0.3, index=slice_close.index)
        position[slice_close >= high20] = 1.0
        position[slice_close <= low20] = -1.0
        position = position.shift(1).fillna(0)

    else:  # Defensive
        position = pd.Series(0.2, index=slice_close.index)

    strat_ret = (daily_ret * position).tail(lookback)

    total_return = round(float((1 + strat_ret).prod() - 1) * 100, 2)
    sharpe = round(
        float(strat_ret.mean() / strat_ret.std() * np.sqrt(252))
        if strat_ret.std() > 0 else 0.0,
        3,
    )
    win_rate = round(float((strat_ret > 0).mean() * 100), 1)

    cumulative = (1 + strat_ret).cumprod()
    peak = cumulative.cummax()
    drawdown = (peak - cumulative) / peak.replace(0, np.nan)
    max_dd = round(float(drawdown.max() * 100) if not drawdown.empty and not drawdown.isna().all() else 0.0, 2)

    return {
        "strategy": strategy,
        "total_return": total_return,
        "sharpe_ratio": sharpe,
        "win_rate": win_rate,
        "max_drawdown": max_dd,
    }


def get_strategy_recommendation(symbol: str) -> dict:
    df_raw = yf.download(symbol, period="2y", auto_adjust=True, progress=False)
    if df_raw.empty or len(df_raw) < 100:
        raise ValueError(f"Nu s-au găsit date suficiente pentru {symbol}")

    close = _to_series(df_raw["Close"]).astype(float)

    # ── Build training dataset from sliding windows ──────────────────────────
    window_size = 30
    step = 5
    min_history = 60
    X_list, y_list = [], []

    for start in range(min_history, len(close) - window_size - 1, step):
        window_features = _compute_market_features(close.iloc[: start + 1])
        if window_features.isna().any():
            continue

        window_close = close.iloc[start : start + window_size]
        returns = {s: _simulate_strategy_return(window_close, s) for s in STRATEGIES}
        best_idx = STRATEGIES.index(max(returns, key=returns.get))

        X_list.append(window_features.values)
        y_list.append(best_idx)

    if len(X_list) < 20:
        raise ValueError(f"Date insuficiente pentru antrenarea modelului la {symbol}")

    X = np.array(X_list)
    y = np.array(y_list)

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = LogisticRegression(max_iter=1000, random_state=42, C=1.0)
    model.fit(X_scaled, y)

    # ── Current prediction ────────────────────────────────────────────────────
    current_feat = _compute_market_features(close)
    if current_feat.isna().any():
        current_feat = current_feat.fillna(0)

    X_current = scaler.transform(current_feat.values.reshape(1, -1))

    # predict_proba output has one probability per class seen during training
    probs_raw = model.predict_proba(X_current)[0]
    classes_seen = model.classes_

    # Build full probability vector over all 5 strategies
    prob_full = np.zeros(len(STRATEGIES))
    for idx, cls in enumerate(classes_seen):
        if cls < len(STRATEGIES):
            prob_full[cls] = probs_raw[idx]

    strategy_scores = [
        {
            "strategy": STRATEGIES[i],
            "score": round(float(prob_full[i]), 4),
            "description": STRATEGY_DESCRIPTIONS[STRATEGIES[i]],
        }
        for i in range(len(STRATEGIES))
    ]
    strategy_scores.sort(key=lambda x: x["score"], reverse=True)
    recommended_strategy = strategy_scores[0]["strategy"]

    # ── Market conditions ─────────────────────────────────────────────────────
    cf = current_feat
    vol = float(cf["volatility"]) if not np.isnan(cf["volatility"]) else 0.0
    trend = float(cf["trend_slope"]) if not np.isnan(cf["trend_slope"]) else 0.0
    momentum = float(cf["momentum"]) if not np.isnan(cf["momentum"]) else 0.0
    sma_cross = float(cf["sma_cross"]) if not np.isnan(cf["sma_cross"]) else 0.0

    if abs(sma_cross) > 0.05 or abs(trend) > 0.03:
        regime = "trending_up" if sma_cross > 0 else "trending_down"
    elif vol > 0.4:
        regime = "volatile"
    else:
        regime = "sideways"

    market_conditions = {
        "volatility": round(vol, 4),
        "trend_strength": round(abs(trend), 4),
        "momentum": round(momentum, 4),
        "regime": regime,
    }

    # ── Backtest results ──────────────────────────────────────────────────────
    backtest_results = [_backtest_strategy(close, s) for s in STRATEGIES]

    return {
        "symbol": symbol.upper(),
        "recommended_strategy": recommended_strategy,
        "strategy_scores": strategy_scores,
        "market_conditions": market_conditions,
        "backtest_results": backtest_results,
    }
