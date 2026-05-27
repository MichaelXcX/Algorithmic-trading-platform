"""Inference pipeline: HMM → LSTM → GNN → allocation weights.

Execution order at inference time (unidirectional):
  1. HMM:  reads returns → produces state, state_probs, transition_matrix
  2. LSTM: reads OHLCV + HMM context → produces (μ, uncertainty) per asset
  3. GNN:  reads returns + HMM probs + LSTM outputs → produces allocation weights

Training (bidirectional): LSTM and GNN are co-trained end-to-end via
  WalkForwardTrainer in training_service.py.
"""

from __future__ import annotations

import logging
import pathlib
import pickle
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
import torch
import yfinance as yf

from .hmm_service import MarketRegimeHMM
from .lstm_forecaster import (
    LSTMForecast,
    RegimeLSTM,
    build_features,
    predict_with_uncertainty,
    FEATURE_DIM,
)
from .gnn_portfolio import (
    RegimeGNN,
    build_node_features,
    build_regime_graph,
    GNN_NODE_DIM,
)
from .training_service import WalkForwardTrainer

logger = logging.getLogger(__name__)

LOOKBACK = 60
DATA_PERIOD = "2y"

# Checkpoint directory — override with CHECKPOINT_DIR env var
CHECKPOINT_DIR = pathlib.Path(
    __import__("os").getenv("CHECKPOINT_DIR", str(pathlib.Path(__file__).parent.parent / "checkpoints"))
)

# ---------------------------------------------------------------------------
# Module-level model singletons (lazy-initialised, checkpoint-backed)
# ---------------------------------------------------------------------------

_hmm: MarketRegimeHMM = MarketRegimeHMM()
_lstm: Optional[RegimeLSTM] = None
_gnn: Optional[RegimeGNN] = None
_trainer: Optional[WalkForwardTrainer] = None

# Last-known regime — used by get_lstm_forecast when the multi-asset HMM can't
# be queried with single-asset data.
_regime_cache: dict = {"state": 2, "probs": [1 / 3, 1 / 3, 1 / 3]}

import os as _os
MLFLOW_URI = _os.getenv("MLFLOW_TRACKING_URI", str(pathlib.Path(__file__).parent.parent / "mlruns"))
_hmm_fit_status: dict = {"running": False, "error": None}

# Load HMM from checkpoint at import time if available
_hmm_ckpt = CHECKPOINT_DIR / "hmm.pkl"
if _hmm_ckpt.exists():
    try:
        with open(_hmm_ckpt, "rb") as _f:
            _hmm = pickle.load(_f)
        logger.info("Loaded HMM checkpoint from %s", _hmm_ckpt)
    except Exception as _exc:
        logger.warning("HMM checkpoint load failed, starting fresh: %s", _exc)


def _get_lstm() -> RegimeLSTM:
    global _lstm
    if _lstm is None:
        _lstm = RegimeLSTM(in_dim=FEATURE_DIM, hidden=128, n_layers=2, n_regimes=3)
        ckpt = CHECKPOINT_DIR / "lstm.pt"
        if ckpt.exists():
            try:
                _lstm.load_state_dict(torch.load(ckpt, map_location="cpu", weights_only=True))
                logger.info("Loaded LSTM checkpoint from %s", ckpt)
            except Exception as exc:
                logger.warning("LSTM checkpoint load failed, starting fresh: %s", exc)
        _lstm.eval()
    return _lstm


def _get_gnn() -> RegimeGNN:
    global _gnn
    if _gnn is None:
        _gnn = RegimeGNN(in_dim=GNN_NODE_DIM, hidden=64, n_regimes=3)
        ckpt = CHECKPOINT_DIR / "gnn.pt"
        if ckpt.exists():
            try:
                _gnn.load_state_dict(torch.load(ckpt, map_location="cpu", weights_only=True))
                logger.info("Loaded GNN checkpoint from %s", ckpt)
            except Exception as exc:
                logger.warning("GNN checkpoint load failed, starting fresh: %s", exc)
        _gnn.eval()
    return _gnn


def _save_checkpoints() -> None:
    """Persist model state dicts and HMM to disk."""
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    torch.save(_get_lstm().state_dict(), CHECKPOINT_DIR / "lstm.pt")
    torch.save(_get_gnn().state_dict(), CHECKPOINT_DIR / "gnn.pt")
    with open(CHECKPOINT_DIR / "hmm.pkl", "wb") as f:
        pickle.dump(_hmm, f)
    logger.info("Checkpoints saved to %s", CHECKPOINT_DIR)


def _save_hmm_checkpoint() -> None:
    CHECKPOINT_DIR.mkdir(parents=True, exist_ok=True)
    with open(CHECKPOINT_DIR / "hmm.pkl", "wb") as f:
        pickle.dump(_hmm, f)
    logger.info("HMM checkpoint saved to %s", CHECKPOINT_DIR)


def fit_hmm(symbols: list[str]) -> None:
    """Fit (or refit) the multivariate HMM. Intended for background task execution."""
    global _hmm_fit_status
    _hmm_fit_status = {"running": True, "error": None}
    try:
        import mlflow
        returns_df = _download_returns(symbols, period="1y")
        _hmm.fit(returns_df.values)

        mlflow.set_tracking_uri(MLFLOW_URI)
        mlflow.set_experiment("algorithmic_trading")
        with mlflow.start_run(run_name="hmm_fit"):
            mlflow.log_param("symbols", ",".join(symbols))
            mlflow.log_param("n_features", _hmm.n_features)
            mlflow.log_param("n_states", MarketRegimeHMM.N_STATES)
            if _hmm.model is not None:
                for i, name in MarketRegimeHMM.STATE_NAMES.items():
                    mlflow.log_metric(f"mean_{name}", float(_hmm.model.means_[i].mean()))
        _save_hmm_checkpoint()
    except Exception as e:
        _hmm_fit_status["error"] = str(e)
        logger.error("HMM fit failed: %s", e)
        raise
    finally:
        _hmm_fit_status["running"] = False


def get_hmm_status() -> dict:
    return {
        "fitted": _hmm.is_fitted(),
        "running": _hmm_fit_status["running"],
        "n_features": _hmm.n_features,
        "error": _hmm_fit_status.get("error"),
    }


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------

def _download_ohlcv(symbol: str, period: str = DATA_PERIOD) -> pd.DataFrame:
    df = yf.download(symbol, period=period, auto_adjust=True, progress=False)
    if df.empty:
        raise ValueError(f"No data found for symbol '{symbol}'")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
    return df


def _download_returns(symbols: list[str], period: str = DATA_PERIOD) -> pd.DataFrame:
    raw = yf.download(symbols, period=period, auto_adjust=True, progress=False)
    if isinstance(raw.columns, pd.MultiIndex):
        close = raw["Close"]
    else:
        close = raw[["Close"]] if "Close" in raw.columns else raw
        close.columns = symbols[:1]
    returns = np.log(close / close.shift(1)).dropna()
    return returns


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_regime_state(symbols: list[str]) -> dict:
    """Return current HMM regime state and probabilities for a set of symbols."""
    global _regime_cache
    returns_df = _download_returns(symbols, period="1y")
    X = returns_df.values  # (T, N_assets) — multivariate

    if not _hmm.is_fitted():
        raise ValueError("HMM not fitted. POST /hmm/fit first.")

    state = _hmm.current_state(X)
    probs = _hmm.state_probs(X)
    _regime_cache = {"state": state, "probs": probs.tolist()}
    transmat = _hmm.transition_matrix()

    return {
        "current_state": state,
        "state_name": MarketRegimeHMM.STATE_NAMES[state],
        "state_probs": probs.tolist(),
        "transition_matrix": transmat.tolist(),
    }


def get_lstm_forecast(symbol: str, n_samples: int = 30) -> dict:
    """Return probabilistic LSTM forecast for a single asset."""
    ohlcv = _download_ohlcv(symbol)

    close = ohlcv["Close"]
    log_ret = np.log(close / close.shift(1)).dropna().values  # (T,)

    # Use portfolio-level HMM if already fitted on multi-asset data; otherwise
    # fall back to the last-known regime from _regime_cache (updated by
    # get_regime_state / get_portfolio_weights).
    if _hmm.is_fitted() and (_hmm.n_features or 1) > 1:
        state = _regime_cache["state"]
        probs = np.array(_regime_cache["probs"])
    elif _hmm.is_fitted():
        state = _hmm.current_state(log_ret)
        probs = _hmm.state_probs(log_ret)
    else:
        state = _regime_cache["state"]
        probs = np.array(_regime_cache["probs"])

    if len(ohlcv) < LOOKBACK:
        raise ValueError(f"Not enough history for '{symbol}' (need {LOOKBACK} bars)")

    feats = build_features(ohlcv, state, probs)        # (T, FEATURE_DIM)
    x = torch.tensor(feats[-LOOKBACK:], dtype=torch.float).unsqueeze(0)  # (1, T, F)

    lstm = _get_lstm()
    forecast: LSTMForecast = predict_with_uncertainty(lstm, x, state, n_samples)

    return {
        "symbol": symbol.upper(),
        "mean_return": round(forecast.mu, 6),
        "log_sigma": round(forecast.log_sigma, 6),
        "uncertainty": round(forecast.uncertainty, 6),
        "regime_state": state,
        "regime_name": MarketRegimeHMM.STATE_NAMES[state],
    }


def get_portfolio_weights(symbols: list[str]) -> dict:
    """Run the full inference pipeline and return GNN portfolio weights.

    Step 1: HMM  → state, state_probs
    Step 2: LSTM → (μ, uncertainty) per asset
    Step 3: GNN  → allocation weights (long-only, sum to 1)
    """
    returns_df = _download_returns(symbols)
    X = returns_df.values  # (T, N_assets) — multivariate

    if not _hmm.is_fitted():
        raise ValueError("HMM not fitted. POST /hmm/fit first.")

    state = _hmm.current_state(X)
    probs = _hmm.state_probs(X)
    _regime_cache.update({"state": state, "probs": probs.tolist()})

    # --- Step 2: LSTM per asset ---
    lstm = _get_lstm()
    lstm_forecasts: dict[str, dict] = {}
    for symbol in symbols:
        try:
            ohlcv = _download_ohlcv(symbol)
            if len(ohlcv) < LOOKBACK:
                raise ValueError("insufficient history")
            feats = build_features(ohlcv, state, probs)
            x = torch.tensor(feats[-LOOKBACK:], dtype=torch.float).unsqueeze(0)
            fc: LSTMForecast = predict_with_uncertainty(lstm, x, state, n_samples=30)
            lstm_forecasts[symbol] = {"mu": fc.mu, "uncertainty": fc.uncertainty}
        except Exception as exc:
            logger.warning("LSTM forecast failed for %s: %s", symbol, exc)
            lstm_forecasts[symbol] = {"mu": 0.0, "uncertainty": 0.0}

    # --- Step 3: GNN ---
    gnn = _get_gnn()
    with torch.no_grad():
        edge_index, edge_weight = build_regime_graph(returns_df.iloc[-LOOKBACK:], state)
        node_feats = build_node_features(returns_df.iloc[-LOOKBACK:], probs, lstm_forecasts)
        weights = gnn(node_feats, edge_index, edge_weight, state)

    return {
        "symbols": symbols,
        "weights": weights.detach().cpu().numpy().tolist(),
        "lstm_forecasts": {
            sym: {
                "mu": round(lstm_forecasts[sym]["mu"], 6),
                "uncertainty": round(lstm_forecasts[sym]["uncertainty"], 6),
            }
            for sym in symbols
        },
        "regime_state": state,
        "regime_name": MarketRegimeHMM.STATE_NAMES[state],
        "timestamp": datetime.utcnow().isoformat() + "Z",
    }


def train_models(symbols: list[str], epochs_per_fold: int = 10, verbose: bool = True) -> dict:
    """Trigger walk-forward co-training for the given universe of assets.

    This is an expensive operation — should be called offline or via a
    background job, not on every request.
    """
    global _trainer

    ohlcv_dict: dict[str, pd.DataFrame] = {}
    for sym in symbols:
        ohlcv_dict[sym] = _download_ohlcv(sym)

    # Build aligned log-return DataFrame
    closes = pd.DataFrame(
        {sym: np.log(df["Close"] / df["Close"].shift(1)) for sym, df in ohlcv_dict.items()}
    ).dropna()

    # Fit HMM first — multivariate on full returns matrix
    _hmm.fit(closes.values)

    lstm = _get_lstm()
    gnn = _get_gnn()
    _trainer = WalkForwardTrainer(hmm=_hmm, lstm=lstm, gnn=gnn)

    history = _trainer.fit_portfolio(
        ohlcv_dict=ohlcv_dict,
        returns_df=closes,
        epochs_per_fold=epochs_per_fold,
        verbose=verbose,
    )

    _save_checkpoints()

    return {
        "symbols": symbols,
        "folds_completed": len(history),
        "history": history,
    }
