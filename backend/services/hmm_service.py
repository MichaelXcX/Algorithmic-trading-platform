import numpy as np
from hmmlearn.hmm import GaussianHMM
from scipy.optimize import linear_sum_assignment


class MarketRegimeHMM:
    N_STATES = 3
    STATE_NAMES = {0: "bull", 1: "bear", 2: "sideways"}

    def __init__(self):
        self.model: GaussianHMM | None = None
        self._prev_means: np.ndarray | None = None  # (N_states, N_features) — standardized space
        self._scaler_mean: np.ndarray | None = None  # (N_features,)
        self._scaler_std: np.ndarray | None = None   # (N_features,)

    # ── public ────────────────────────────────────────────────────────────────

    def fit(self, returns: np.ndarray) -> "MarketRegimeHMM":
        # returns: (T, N_assets) or (T,) for single-asset
        X_raw = returns if returns.ndim == 2 else returns.reshape(-1, 1)

        # Standardise per-asset so high-vol stocks don't dominate emission probs
        self._scaler_mean = X_raw.mean(axis=0)
        self._scaler_std = X_raw.std(axis=0).clip(min=1e-8)
        X = (X_raw - self._scaler_mean) / self._scaler_std

        model = GaussianHMM(
            n_components=self.N_STATES,
            covariance_type="diag",   # full covariance overflows with O(10) correlated assets
            n_iter=300,
            tol=1e-4,
            min_covar=1e-4,
            random_state=42,
        )
        model.fit(X)

        if self._prev_means is not None:
            model = self._stabilize_labels(model)
        else:
            order = self._canonical_order(model.means_)
            model = self._reorder(model, order)

        self._prev_means = model.means_.copy()
        self.model = model
        return self

    def current_state(self, returns: np.ndarray) -> int:
        assert self.model is not None, "HMM not fitted"
        return int(self.model.predict(self._scale(returns))[-1])

    def state_probs(self, returns: np.ndarray) -> np.ndarray:
        """Posterior probabilities for the last observation. Shape: (N_STATES,)."""
        assert self.model is not None, "HMM not fitted"
        _, posteriors = self.model.score_samples(self._scale(returns))
        return posteriors[-1]

    def transition_matrix(self) -> np.ndarray:
        assert self.model is not None, "HMM not fitted"
        return self.model.transmat_.copy()

    def is_fitted(self) -> bool:
        return self.model is not None

    @property
    def n_features(self) -> int | None:
        return None if self.model is None else self.model.means_.shape[1]

    # ── private ───────────────────────────────────────────────────────────────

    def _scale(self, returns: np.ndarray) -> np.ndarray:
        X_raw = returns if returns.ndim == 2 else returns.reshape(-1, 1)
        return (X_raw - self._scaler_mean) / self._scaler_std

    @staticmethod
    def _canonical_order(means: np.ndarray) -> np.ndarray:
        # means: (N_states, N_features) — average across features to get a scalar per state
        # order[new_canonical_state] = old_internal_state  (NumPy fancy-indexing semantics)
        scalar_means = means.mean(axis=1)
        sorted_idx = np.argsort(scalar_means)[::-1]  # descending
        order = np.empty(3, dtype=int)
        order[0] = sorted_idx[0]  # new 0 (bull)     ← old highest-mean state
        order[1] = sorted_idx[2]  # new 1 (bear)     ← old lowest-mean state
        order[2] = sorted_idx[1]  # new 2 (sideways) ← old middle-mean state
        return order

    def _stabilize_labels(self, new_model: GaussianHMM) -> GaussianHMM:
        """Relabel new states to stay consistent with previous fit via Hungarian algorithm."""
        old_means = self._prev_means.mean(axis=1)    # (N_states,)
        new_means = new_model.means_.mean(axis=1)    # (N_states,)
        cost = np.abs(new_means[:, None] - old_means[None, :])
        row_ind, col_ind = linear_sum_assignment(cost)
        reorder = np.empty(self.N_STATES, dtype=int)
        for k in range(self.N_STATES):
            reorder[col_ind[k]] = row_ind[k]
        return self._reorder(new_model, reorder)

    @staticmethod
    def _reorder(model: GaussianHMM, order: np.ndarray) -> GaussianHMM:
        model.means_ = model.means_[order]
        model.covars_ = model.covars_[order]
        model.transmat_ = model.transmat_[np.ix_(order, order)]
        model.startprob_ = model.startprob_[order]
        return model
