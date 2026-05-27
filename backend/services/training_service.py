"""Walk-forward co-training for RegimeLSTM + RegimeGNN.

Training strategy:
  - Expanding window (walk-forward) CV, never shuffle time-series data
  - 5-bar purge/embargo between train and validation sets
  - Retrain every STEP_BARS trading days
  - Minimum 252-bar training window per regime
  - Co-training: LSTM predicts returns, GNN allocates on those predictions
    Loss = NLL (LSTM) + λ · (-Sharpe) (portfolio)
  - Gradient clipping to prevent exploding gradients

LSTM - GNN dependency:
  - Training: end-to-end co-training with shared Sharpe loss
  - Inference: LSTM first, then GNN (see portfolio_service.py)
"""

from __future__ import annotations

import pathlib as _pathlib
import os as _os
MLFLOW_URI = _os.getenv("MLFLOW_TRACKING_URI", str(_pathlib.Path(__file__).parent.parent / "mlruns"))
MLFLOW_EXPERIMENT = "algorithmic_trading"

import numpy as np
import pandas as pd
import torch
import torch.optim as optim

from .hmm_service import MarketRegimeHMM
from .lstm_forecaster import RegimeLSTM, nll_loss, build_features
from .gnn_portfolio import RegimeGNN, build_regime_graph, build_node_features, sharpe_loss

EMBARGO_BARS = 5
VALIDATION_BARS = 20
STEP_BARS = 20
MIN_TRAIN_BARS = 252
LOOKBACK = 60
FORECAST_HORIZON = 5


class WalkForwardTrainer:
    def __init__(
        self,
        hmm: MarketRegimeHMM,
        lstm: RegimeLSTM,
        gnn: RegimeGNN,
        lr: float = 3e-4,
        weight_decay: float = 1e-5,
        lambda_sharpe: float = 0.5,
        uncertainty_cutoff: float = 0.015,
    ):
        self.hmm = hmm
        self.lstm = lstm
        self.gnn = gnn
        self.lambda_sharpe = lambda_sharpe
        self.uncertainty_cutoff = uncertainty_cutoff
        self.optimizer = optim.Adam(
            list(lstm.parameters()) + list(gnn.parameters()),
            lr=lr,
            weight_decay=weight_decay,
        )
        self.train_history: list[dict] = []

    def fit(
        self,
        prices_df: pd.DataFrame,
        epochs_per_fold: int = 10,
        batch_size: int = 64,
        verbose: bool = True,
    ) -> list[dict]:
        """
        prices_df: OHLCV per asset as returned by yfinance (MultiIndex columns or Close column).
                   Must have a DatetimeIndex.

        This method accepts a dict of {symbol: ohlcv_df} or a single-asset Close price Series.
        For portfolio training, pass a dict mapping symbol → full OHLCV DataFrame.
        """
        raise NotImplementedError(
            "Call fit_portfolio() for multi-asset training or fit_single() for one asset."
        )

    def fit_portfolio(
        self,
        ohlcv_dict: dict[str, pd.DataFrame],
        returns_df: pd.DataFrame,
        epochs_per_fold: int = 10,
        verbose: bool = True,
    ) -> list[dict]:
        """Walk-forward co-training on a portfolio of assets.

        ohlcv_dict: {symbol: full OHLCV DataFrame}  (for LSTM feature engineering)
        returns_df: log-return DataFrame, columns = symbols, DatetimeIndex aligned
        """
        avg_returns = returns_df.mean(axis=1).values
        self.hmm.fit(avg_returns)

        T = len(returns_df)
        fold = 0
        start = MIN_TRAIN_BARS

        while start + EMBARGO_BARS + VALIDATION_BARS <= T:
            train_returns = returns_df.iloc[:start]
            val_start = start + EMBARGO_BARS
            val_end = min(val_start + VALIDATION_BARS, T)
            val_returns = returns_df.iloc[val_start:val_end]

            # Regime for this training window
            hmm_state = self.hmm.current_state(train_returns.mean(axis=1).values)
            hmm_probs = self.hmm.state_probs(train_returns.mean(axis=1).values)

            # Build training samples per fold
            train_samples = self._build_samples(
                ohlcv_dict, train_returns, hmm_state, hmm_probs
            )
            if not train_samples:
                start += STEP_BARS
                continue

            fold_losses = []
            for epoch in range(epochs_per_fold):
                loss = self._train_step(train_samples, hmm_state)
                fold_losses.append(loss)

            # Validation — pass train_returns so _validate has lookback context
            val_loss = self._validate(
                ohlcv_dict, train_returns, val_returns, hmm_state, hmm_probs
            )

            record = {
                "fold": fold,
                "train_end": int(start),
                "regime": MarketRegimeHMM.STATE_NAMES[hmm_state],
                "train_loss": float(np.mean(fold_losses)),
                "val_loss": float(val_loss),
            }
            self.train_history.append(record)

            if verbose:
                print(
                    f"Fold {fold:3d} | regime={record['regime']:8s} | "
                    f"train_loss={record['train_loss']:.4f} | val_loss={record['val_loss']:.4f}"
                )

            fold += 1
            start += STEP_BARS

        return self.train_history

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_samples(
        self,
        ohlcv_dict: dict[str, pd.DataFrame],
        returns_df: pd.DataFrame,
        hmm_state: int,
        hmm_probs: np.ndarray,
    ) -> list[dict]:
        """Build (x, y) pairs using a sliding lookback window over returns_df."""
        T = len(returns_df)
        if T <= LOOKBACK + FORECAST_HORIZON:
            return []

        # Use first available asset for LSTM feature construction
        first_symbol = list(ohlcv_dict.keys())[0]
        ohlcv = ohlcv_dict[first_symbol]

        samples = []
        max_t = T - FORECAST_HORIZON
        indices = list(range(LOOKBACK, max_t, 4))  # stride=4 to keep manageable

        for t in indices:
            window_ohlcv = ohlcv.iloc[t - LOOKBACK: t]
            if len(window_ohlcv) < LOOKBACK:
                continue
            feats = build_features(window_ohlcv, hmm_state, hmm_probs)  # (lookback, F)
            y = returns_df.mean(axis=1).iloc[t + FORECAST_HORIZON - 1]  # scalar

            # Graph for this window
            edge_index, edge_weight = build_regime_graph(
                returns_df.iloc[t - LOOKBACK: t], hmm_state
            )
            node_feats = build_node_features(
                returns_df.iloc[t - LOOKBACK: t],
                hmm_probs,
                {sym: {"mu": 0.0, "uncertainty": 0.0} for sym in returns_df.columns},
            )
            # Target return vector for portfolio (n_assets,)
            y_vec = returns_df.iloc[t + FORECAST_HORIZON - 1].values.astype(np.float32)

            samples.append({
                "x": torch.tensor(feats, dtype=torch.float).unsqueeze(0),  # (1, T, F)
                "y": torch.tensor([y], dtype=torch.float),                  # (1,)
                "y_vec": torch.tensor(y_vec, dtype=torch.float),            # (n_assets,)
                "edge_index": edge_index,
                "edge_weight": edge_weight,
                "node_feats": node_feats,
            })

        return samples

    def _train_step(
        self,
        samples: list[dict],
        hmm_state: int,
    ) -> float:
        self.lstm.train()
        self.gnn.train()
        np.random.shuffle(samples)
        total_loss = 0.0

        for s in samples:
            self.optimizer.zero_grad()

            # LSTM: train on NLL of mean portfolio return
            lstm_out = self.lstm(s["x"], hmm_state)   # (1, 2)
            forecast_loss = nll_loss(lstm_out, s["y"])

            # GNN: use pre-built per-asset node features from _build_samples.
            # Do NOT overwrite with a single-asset LSTM output — that assigns
            # the same μ to every node and teaches the GNN to ignore its input.
            weights = self.gnn(s["node_feats"], s["edge_index"], s["edge_weight"], hmm_state)
            portfolio_loss = sharpe_loss(weights, s["y_vec"])

            loss = forecast_loss + self.lambda_sharpe * portfolio_loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(
                list(self.lstm.parameters()) + list(self.gnn.parameters()),
                max_norm=1.0,
            )
            self.optimizer.step()
            total_loss += loss.item()

        return total_loss / max(len(samples), 1)

    def _validate(
        self,
        ohlcv_dict: dict[str, pd.DataFrame],
        train_returns: pd.DataFrame,
        val_returns: pd.DataFrame,
        hmm_state: int,
        hmm_probs: np.ndarray,
    ) -> float:
        """Evaluate NLL on validation targets using training-window features as context.

        val_returns is typically only VALIDATION_BARS=20 rows — far too short to
        build a LOOKBACK=60 feature window from scratch. Instead we use the last
        LOOKBACK rows of the training OHLCV as the feature context and evaluate
        the model's single prediction against every available validation target.
        """
        self.lstm.eval()
        self.gnn.eval()

        T_val = len(val_returns)
        if T_val < FORECAST_HORIZON:
            return float("nan")

        first_symbol = list(ohlcv_dict.keys())[0]
        ohlcv = ohlcv_dict[first_symbol]

        # Positional end of training in the full OHLCV (train_returns starts at row 0)
        train_end = len(train_returns)
        ohlcv_context = ohlcv.iloc[max(0, train_end - LOOKBACK): train_end]
        if len(ohlcv_context) < LOOKBACK:
            return float("nan")

        feats = build_features(ohlcv_context, hmm_state, hmm_probs)
        x = torch.tensor(feats, dtype=torch.float).unsqueeze(0)  # (1, LOOKBACK, F)

        # Evaluate against all targets in the validation window
        avg_val = val_returns.mean(axis=1).values
        total = 0.0
        n_valid = 0
        with torch.no_grad():
            lstm_out = self.lstm(x, hmm_state)
            for y_val in avg_val[FORECAST_HORIZON - 1:]:
                y_tensor = torch.tensor([float(y_val)], dtype=torch.float)
                nll = nll_loss(lstm_out, y_tensor).item()
                if np.isfinite(nll):
                    total += nll
                    n_valid += 1

        return total / n_valid if n_valid > 0 else float("nan")
