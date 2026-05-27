from dataclasses import dataclass

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F


FEATURE_DIM = 21  # see build_features()


@dataclass
class LSTMForecast:
    mu: float
    log_sigma: float
    uncertainty: float  # epistemic std from MC-dropout samples


# ---------------------------------------------------------------------------
# Variational (locked) dropout
# ---------------------------------------------------------------------------

class LockedDropout(nn.Module):
    """Samples one mask per sequence and applies it across all T timesteps.

    Standard nn.LSTM dropout re-samples independently at each step, which
    breaks the temporal correlation structure. Locked dropout preserves it.
    """

    def __init__(self, p: float = 0.25):
        super().__init__()
        self.p = p

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        if not self.training or self.p == 0.0:
            return x
        # x: (B, T, H) — mask over H, broadcast across T
        mask = x.new_empty(x.size(0), 1, x.size(2)).bernoulli_(1 - self.p) / (1 - self.p)
        return x * mask


# ---------------------------------------------------------------------------
# RegimeLSTM
# ---------------------------------------------------------------------------

class RegimeLSTM(nn.Module):
    def __init__(
        self,
        in_dim: int = FEATURE_DIM,
        hidden: int = 128,
        n_layers: int = 2,
        n_regimes: int = 3,
        dropout: float = 0.25,
    ):
        super().__init__()
        self.hidden = hidden
        self.n_layers = n_layers

        # Stack LSTM layers manually so we can apply locked dropout between them
        self.lstm_layers = nn.ModuleList()
        for i in range(n_layers):
            self.lstm_layers.append(
                nn.LSTM(in_dim if i == 0 else hidden, hidden, batch_first=True)
            )
        self.locked_drops = nn.ModuleList(
            [LockedDropout(dropout) for _ in range(n_layers - 1)]
        )

        self.attn = nn.Linear(hidden, 1)

        self.heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(hidden, 64),
                nn.ReLU(),
                nn.Linear(64, 2),   # outputs: μ, log σ
            )
            for _ in range(n_regimes)
        ])

    def forward(self, x: torch.Tensor, regime_idx: int) -> torch.Tensor:
        """
        x: (B, T, in_dim)
        Returns: (B, 2) — μ and log σ for the N-bar-ahead return.
        """
        out = x
        for i, lstm in enumerate(self.lstm_layers):
            out, _ = lstm(out)                          # (B, T, H)
            if i < len(self.locked_drops):
                out = self.locked_drops[i](out)

        weights = F.softmax(self.attn(out), dim=1)      # (B, T, 1)
        ctx = (weights * out).sum(dim=1)                # (B, H) attended context
        return self.heads[regime_idx](ctx)              # (B, 2)


# ---------------------------------------------------------------------------
# Loss
# ---------------------------------------------------------------------------

def nll_loss(pred: torch.Tensor, target: torch.Tensor, alpha: float = 0.1) -> torch.Tensor:
    """Negative log-likelihood of Gaussian + directional accuracy term.

    L = log σ + (y − μ)² / (2σ²) − α · sign(μ) · sign(y)
    """
    mu = pred[:, 0]
    log_sigma = pred[:, 1].clamp(-4, 4)
    sigma = log_sigma.exp()
    nll = log_sigma + (target - mu).pow(2) / (2 * sigma.pow(2))
    directional = -alpha * (mu.sign() * target.sign()).float()
    return (nll + directional).mean()


# ---------------------------------------------------------------------------
# MC-dropout inference
# ---------------------------------------------------------------------------

def predict_with_uncertainty(
    model: RegimeLSTM,
    x: torch.Tensor,
    regime_idx: int,
    n_samples: int = 30,
) -> LSTMForecast:
    """Run forward pass n_samples times with dropout active to estimate uncertainty.

    Mean of μ samples = epistemic mean return.
    Std of μ samples  = epistemic uncertainty (skip trade if > cutoff).
    """
    model.train()  # keep dropout masks active
    with torch.no_grad():
        samples = [model(x, regime_idx) for _ in range(n_samples)]
    mus = torch.stack([s[:, 0] for s in samples])       # (n_samples, B)
    mean_mu = mus.mean(0).item()
    uncertainty = mus.std(0).item()
    log_sigma = samples[0][:, 1].mean().item()
    model.eval()
    return LSTMForecast(mu=mean_mu, log_sigma=log_sigma, uncertainty=uncertainty)


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------

def build_features(
    ohlcv: pd.DataFrame,
    hmm_state: int,
    hmm_state_probs: np.ndarray,
    sentiment_z: float = 0.0,
    n_regimes: int = 3,
) -> np.ndarray:
    """Compute the 21-dim feature matrix for a single asset.

    ohlcv:  DataFrame with columns Open/High/Low/Close/Volume, DatetimeIndex.
    Returns array of shape (T, FEATURE_DIM).
    """
    import pandas_ta  # noqa: F401  # registers df.ta accessor

    df = ohlcv.copy()
    df.columns = [c.lower() for c in df.columns]  # pandas_ta expects lowercase
    close = df["close"]
    volume = df["volume"]
    high = df["high"]
    low = df["low"]
    T = len(df)

    # --- Price / volume features ---
    log_ret = np.log(close / close.shift(1)).fillna(0)
    log_ret5 = log_ret.rolling(5).mean().fillna(0)
    log_ret20 = log_ret.rolling(20).mean().fillna(0)
    real_vol = log_ret.rolling(20).std().fillna(0)

    vol_mean = volume.rolling(20).mean()
    vol_std = volume.rolling(20).std().replace(0, 1)
    vol_z = ((volume - vol_mean) / vol_std).fillna(0)

    vwap_proxy = (close * volume).rolling(20).sum() / volume.rolling(20).sum().replace(0, 1)
    vwap_dev = ((close - vwap_proxy) / vwap_proxy.replace(0, 1)).fillna(0)

    hl_ratio = ((high - low) / close.replace(0, 1)).fillna(0)

    # --- Technical indicators via pandas_ta ---
    df.ta.rsi(length=14, append=True)
    df.ta.macd(fast=12, slow=26, signal=9, append=True)
    df.ta.bbands(length=20, append=True)
    df.ta.atr(length=14, append=True)
    df.ta.adx(length=14, append=True)

    rsi = df.get("RSI_14", pd.Series(0.5, index=df.index)).fillna(0.5) / 100.0
    macd_h = df.get("MACDh_12_26_9", pd.Series(0.0, index=df.index)).fillna(0.0)
    bb_pct = df.get("BBP_20_2.0", pd.Series(0.5, index=df.index)).fillna(0.5)
    atr_ratio = (
        df.get("ATRr_14", pd.Series(0.0, index=df.index)).fillna(0.0) / close.replace(0, 1)
    )
    adx = df.get("ADX_14", pd.Series(0.0, index=df.index)).fillna(0.0) / 100.0

    # --- HMM context ---
    regime_onehot = np.zeros((T, n_regimes), dtype=np.float32)
    regime_onehot[:, hmm_state] = 1.0
    regime_probs = np.tile(hmm_state_probs.astype(np.float32), (T, 1))

    # --- Sentiment & time encoding ---
    sentiment = np.full(T, sentiment_z, dtype=np.float32)
    doy = np.array([d.dayofyear for d in df.index], dtype=np.float32)
    tod_sin = np.sin(2 * np.pi * doy / 252)
    tod_cos = np.cos(2 * np.pi * doy / 252)

    def _znorm(s: pd.Series, window: int = 20) -> np.ndarray:
        r = s.rolling(window)
        z = (s - r.mean()) / (r.std().replace(0, 1))
        return z.fillna(0).values.astype(np.float32)

    parts = [
        _znorm(log_ret).reshape(-1, 1),
        _znorm(log_ret5).reshape(-1, 1),
        _znorm(log_ret20).reshape(-1, 1),
        _znorm(real_vol).reshape(-1, 1),
        _znorm(vol_z).reshape(-1, 1),
        _znorm(vwap_dev).reshape(-1, 1),
        _znorm(hl_ratio).reshape(-1, 1),
        rsi.values.reshape(-1, 1).astype(np.float32),
        _znorm(macd_h).reshape(-1, 1),
        bb_pct.values.reshape(-1, 1).astype(np.float32),
        _znorm(atr_ratio).reshape(-1, 1),
        adx.values.reshape(-1, 1).astype(np.float32),
        regime_onehot,                                   # (T, 3)
        regime_probs,                                    # (T, 3)
        sentiment.reshape(-1, 1),
        tod_sin.reshape(-1, 1),
        tod_cos.reshape(-1, 1),
    ]

    return np.hstack(parts)  # (T, 21)
