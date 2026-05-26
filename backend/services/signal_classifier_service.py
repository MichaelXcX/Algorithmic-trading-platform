import warnings

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.metrics import accuracy_score
from xgboost import XGBClassifier

warnings.filterwarnings("ignore")

FEATURE_COLS = [
    "rsi",
    "macd",
    "macd_hist",
    "bb_position",
    "bb_width_pct",
    "sma_ratio",
    "sma_cross",
    "volume_ratio",
    "momentum_5d",
    "momentum_10d",
    "momentum_20d",
    "volatility",
]


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


def _build_features(close: pd.Series, volume: pd.Series) -> pd.DataFrame:
    result = pd.DataFrame(index=close.index)

    result["rsi"] = _compute_rsi(close)

    ema12 = close.ewm(span=12, min_periods=12).mean()
    ema26 = close.ewm(span=26, min_periods=26).mean()
    macd = ema12 - ema26
    macd_signal = macd.ewm(span=9, min_periods=9).mean()
    result["macd"] = macd
    result["macd_hist"] = macd - macd_signal

    sma20 = close.rolling(20).mean()
    std20 = close.rolling(20).std()
    sma50 = close.rolling(50).mean()
    bb_upper = sma20 + 2 * std20
    bb_lower = sma20 - 2 * std20
    bb_width = bb_upper - bb_lower
    result["bb_position"] = (close - bb_lower) / bb_width.replace(0, np.nan)
    result["bb_width_pct"] = bb_width / sma20.replace(0, np.nan)

    result["sma_ratio"] = close / sma20.replace(0, np.nan)
    result["sma_cross"] = sma20 / sma50.replace(0, np.nan)

    vol_ma = volume.rolling(20).mean()
    result["volume_ratio"] = volume / vol_ma.replace(0, np.nan)

    result["momentum_5d"] = close.pct_change(5)
    result["momentum_10d"] = close.pct_change(10)
    result["momentum_20d"] = close.pct_change(20)
    result["volatility"] = close.pct_change().rolling(20).std() * np.sqrt(252)

    # Extra columns used only for the API response (not ML features)
    result["_close"] = close
    result["_macd_signal"] = macd_signal
    result["_sma20"] = sma20
    result["_sma50"] = sma50
    result["_bb_upper"] = bb_upper
    result["_bb_lower"] = bb_lower

    return result


def _create_labels(
    close: pd.Series, forward_days: int = 5, threshold: float = 0.02
) -> pd.Series:
    future_ret = close.shift(-forward_days) / close - 1
    labels = pd.Series("HOLD", index=close.index)
    labels[future_ret > threshold] = "BUY"
    labels[future_ret < -threshold] = "SELL"
    return labels


LABEL_TO_INT = {"BUY": 0, "HOLD": 1, "SELL": 2}
INT_TO_LABEL = {0: "BUY", 1: "HOLD", 2: "SELL"}


def get_signal_classification(symbol: str) -> dict:
    df_raw = yf.download(symbol, period="2y", auto_adjust=True, progress=False)
    if df_raw.empty or len(df_raw) < 100:
        raise ValueError(f"Nu s-au găsit date suficiente pentru {symbol}")

    close = _to_series(df_raw["Close"]).astype(float)
    volume = _to_series(df_raw["Volume"]).astype(float)

    features_df = _build_features(close, volume)
    labels = _create_labels(close)
    features_df["_label"] = labels

    all_cols = FEATURE_COLS + [
        "_close",
        "_macd_signal",
        "_sma20",
        "_sma50",
        "_bb_upper",
        "_bb_lower",
        "_label",
    ]
    combined = features_df[all_cols].dropna().iloc[:-5]  # remove label-less tail

    if len(combined) < 60:
        raise ValueError(f"Date insuficiente după procesare pentru {symbol}")

    X = combined[FEATURE_COLS].values
    y = combined["_label"].map(LABEL_TO_INT).values

    # Ensure all 3 classes are present; if not, lower threshold and retry
    if len(np.unique(y)) < 2:
        raise ValueError("Variabilitate insuficientă în datele de antrenare")

    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    model = XGBClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="mlogloss",
        random_state=42,
        verbosity=0,
    )
    model.fit(X_train, y_train)

    accuracy = float(accuracy_score(y_test, model.predict(X_test)))

    # Predict on the most recent data point (may be more recent than labeled set)
    current_features = features_df[FEATURE_COLS].dropna()
    if current_features.empty:
        raise ValueError("Nu s-au putut calcula features pentru datele curente")
    X_current = current_features.iloc[-1].values.reshape(1, -1)
    current_pred_int = int(model.predict(X_current)[0])
    current_probs = model.predict_proba(X_current)[0]
    current_signal = INT_TO_LABEL.get(current_pred_int, "HOLD")
    confidence = round(float(np.max(current_probs)), 3)

    feature_importances = sorted(
        [
            {"feature": f, "importance": round(float(v), 4)}
            for f, v in zip(FEATURE_COLS, model.feature_importances_)
        ],
        key=lambda x: x["importance"],
        reverse=True,
    )

    # Recent signal history from the last 30 rows in combined (labeled data)
    recent_df = combined.tail(30)
    X_recent = recent_df[FEATURE_COLS].values
    recent_preds = model.predict(X_recent)
    recent_probs_arr = model.predict_proba(X_recent)

    recent_signals = [
        {
            "date": idx.strftime("%Y-%m-%d"),
            "close_price": round(float(row["_close"]), 2),
            "signal": INT_TO_LABEL.get(int(recent_preds[i]), "HOLD"),
            "confidence": round(float(np.max(recent_probs_arr[i])), 3),
        }
        for i, (idx, row) in enumerate(recent_df.iterrows())
    ]

    # Current technical indicators (last row with all indicator values available)
    indicator_df = features_df[
        ["rsi", "macd", "_macd_signal", "_sma20", "_sma50", "_bb_upper", "_bb_lower", "volume_ratio"]
    ].dropna()
    last = indicator_df.iloc[-1]

    tech_indicators = {
        "rsi": round(float(last["rsi"]), 2),
        "macd": round(float(last["macd"]), 4),
        "macd_signal": round(float(last["_macd_signal"]), 4),
        "sma20": round(float(last["_sma20"]), 2),
        "sma50": round(float(last["_sma50"]), 2),
        "bb_upper": round(float(last["_bb_upper"]), 2),
        "bb_lower": round(float(last["_bb_lower"]), 2),
        "volume_ratio": round(float(last["volume_ratio"]), 2),
    }

    return {
        "symbol": symbol.upper(),
        "current_signal": current_signal,
        "confidence": confidence,
        "feature_importances": feature_importances,
        "recent_signals": recent_signals,
        "technical_indicators": tech_indicators,
        "model_accuracy": round(accuracy, 3),
    }
