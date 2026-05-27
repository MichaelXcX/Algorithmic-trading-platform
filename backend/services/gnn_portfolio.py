import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F

# Regime-specific correlation thresholds τ:
#   Bull  — dense graph, assets co-move strongly (momentum signals)
#   Bear  — sparse graph, only genuinely correlated assets (defensive clusters)
#   Sideways — moderate, mean-reversion pairs emerge as edges
REGIME_THRESHOLDS = {0: 0.55, 1: 0.65, 2: 0.45}

GNN_NODE_DIM = 10  # see build_node_features()


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_regime_graph(
    returns_df: pd.DataFrame,
    hmm_state: int,
    window: int = 60,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Build an undirected correlation graph conditioned on the current regime.

    Returns edge_index (2, E) and edge_weight (E,).
    Falls back to self-loops when no pair exceeds τ (prevents empty graph).
    """
    tau = REGIME_THRESHOLDS[hmm_state]
    recent = returns_df.iloc[-window:]
    corr = recent.corr()
    assets = list(returns_df.columns)
    n = len(assets)

    edges: list[list[int]] = []
    weights: list[float] = []

    for i in range(n):
        for j in range(i + 1, n):
            c = corr.iloc[i, j]
            if not np.isnan(c) and c >= tau:
                edges += [[i, j], [j, i]]
                weights += [float(c), float(c)]

    if not edges:
        # Self-loops as fallback so forward pass doesn't crash
        for i in range(n):
            edges.append([i, i])
            weights.append(1.0)

    edge_index = torch.tensor(edges, dtype=torch.long).T.contiguous()   # (2, E)
    edge_weight = torch.tensor(weights, dtype=torch.float)               # (E,)
    return edge_index, edge_weight


# ---------------------------------------------------------------------------
# Node features
# ---------------------------------------------------------------------------

def build_node_features(
    returns_df: pd.DataFrame,
    hmm_state_probs: np.ndarray,
    lstm_forecasts: dict[str, dict],
) -> torch.Tensor:
    """Build per-asset node feature matrix of shape (n_assets, GNN_NODE_DIM).

    Features per node:
        [0]  latest 1-bar return
        [1]  5-bar momentum (mean)
        [2]  20-bar momentum (mean)
        [3]  20-bar realised vol (std)
        [4]  vol ratio: 5-bar std / 20-bar std  (short/long vol)
        [5-7] HMM state probs [P(bull), P(bear), P(sideways)]
        [8]  LSTM predicted mean return μ
        [9]  LSTM epistemic uncertainty
    """
    feats = []
    for asset in returns_df.columns:
        r = returns_df[asset].dropna()
        vol_5 = float(r.iloc[-5:].std()) if len(r) >= 5 else 0.0
        vol_20 = float(r.iloc[-20:].std()) if len(r) >= 20 else 1.0
        row = [
            float(r.iloc[-1]),
            float(r.iloc[-5:].mean()) if len(r) >= 5 else 0.0,
            float(r.iloc[-20:].mean()) if len(r) >= 20 else 0.0,
            vol_20,
            vol_5 / (vol_20 + 1e-8),
            *hmm_state_probs.tolist(),
            lstm_forecasts.get(asset, {}).get("mu", 0.0),
            lstm_forecasts.get(asset, {}).get("uncertainty", 0.0),
        ]
        feats.append(row)
    return torch.tensor(feats, dtype=torch.float)   # (n_assets, 10)


# ---------------------------------------------------------------------------
# WeightedSAGEConv — GraphSAGE layer with edge-weight support
# ---------------------------------------------------------------------------

class WeightedSAGEConv(nn.Module):
    """GraphSAGE convolution that respects edge weights during neighborhood aggregation.

    Aggregation: mean of (neighbor_feat * edge_weight)
    Output: Linear([self_feat || aggregated_feat])
    """

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.lin = nn.Linear(in_channels * 2, out_channels)

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_weight: torch.Tensor | None = None,
    ) -> torch.Tensor:
        n = x.size(0)
        src, dst = edge_index[0], edge_index[1]

        msgs = x[src]                                       # (E, C)
        if edge_weight is not None:
            msgs = msgs * edge_weight.unsqueeze(-1)

        agg = torch.zeros(n, x.size(1), device=x.device)
        agg.scatter_add_(0, dst.unsqueeze(-1).expand_as(msgs), msgs)

        deg = torch.zeros(n, device=x.device)
        deg.scatter_add_(0, dst, torch.ones(dst.size(0), device=x.device))
        agg = agg / deg.unsqueeze(-1).clamp(min=1)

        return self.lin(torch.cat([x, agg], dim=-1))        # (N, out_channels)


# ---------------------------------------------------------------------------
# RegimeGNN
# ---------------------------------------------------------------------------

class RegimeGNN(nn.Module):
    def __init__(self, in_dim: int = GNN_NODE_DIM, hidden: int = 64, n_regimes: int = 3):
        super().__init__()
        self.conv1 = WeightedSAGEConv(in_dim, hidden)
        self.conv2 = WeightedSAGEConv(hidden, hidden)
        self.bn1 = nn.BatchNorm1d(hidden)
        # One allocation head per regime — bull and bear require different aggregation rules
        self.heads = nn.ModuleList([
            nn.Sequential(
                nn.Linear(hidden, 32),
                nn.ReLU(),
                nn.Linear(32, 1),   # raw score per asset
            )
            for _ in range(n_regimes)
        ])

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_weight: torch.Tensor,
        regime_idx: int,
    ) -> torch.Tensor:
        """
        x:           (n_assets, in_dim)
        edge_index:  (2, E)
        edge_weight: (E,)
        Returns:     (n_assets,) long-only portfolio weights summing to 1.
        """
        x = F.relu(self.bn1(self.conv1(x, edge_index, edge_weight)))
        x = F.relu(self.conv2(x, edge_index, edge_weight))
        scores = self.heads[regime_idx](x).squeeze(-1)       # (n_assets,)
        return F.softmax(scores, dim=0)                      # long-only weights


# ---------------------------------------------------------------------------
# Sharpe loss (used during co-training with LSTM)
# ---------------------------------------------------------------------------

def sharpe_loss(weights: torch.Tensor, realized_returns: torch.Tensor, eps: float = 1e-6) -> torch.Tensor:
    """Negative Sharpe ratio (minimise to maximise Sharpe).

    weights:          (n_assets,) — from GNN softmax
    realized_returns: (n_assets,) — actual returns for the period
    """
    portfolio_ret = (weights * realized_returns).sum()
    # Single-period version: just negative return (no std estimate possible)
    return -portfolio_ret
