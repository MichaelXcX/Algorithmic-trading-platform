import numpy as np
from hmmlearn.hmm import GaussianHMM
from scipy.optimize import linear_sum_assignment


class MarketRegimeHMM:
    N_STATES = 3
    N_FACTORS = 3   # number of SVD factors to retain (≤ N_assets)
    STATE_NAMES = {0: "bull", 1: "bear", 2: "sideways"}

    def __init__(self):
        self.model: GaussianHMM | None = None
        self._prev_means: np.ndarray | None = None
        self._scaler_mean: np.ndarray | None = None
        self._scaler_std: np.ndarray | None = None
        self._factors: np.ndarray | None = None  # (N_FACTORS, N_assets) right-singular vectors

    def __setstate__(self, state: dict) -> None:
        # Backward compat: fill attributes added after a checkpoint was saved
        state.setdefault('_scaler_mean', None)
        state.setdefault('_scaler_std', None)
        state.setdefault('_prev_means', None)
        state.setdefault('_factors', None)
        state.setdefault('_pca', None)  # old attribute — ignore
        self.__dict__.update(state)

    # ── public ────────────────────────────────────────────────────────────────

    def fit(self, returns: np.ndarray) -> "MarketRegimeHMM":
        # returns: (T, N_assets) multivariate, or (T,)/(T,1) single-asset
        X_raw = np.array(returns if returns.ndim == 2 else returns.reshape(-1, 1),
                         dtype=np.float64)

        # Hard sanitise: NaN / ±inf → 0 before any computation
        X_raw = np.nan_to_num(X_raw, nan=0.0, posinf=0.0, neginf=0.0)

        # Per-asset z-score
        self._scaler_mean = X_raw.mean(axis=0)
        self._scaler_std  = X_raw.std(axis=0).clip(min=1e-8)
        X_std = np.clip((X_raw - self._scaler_mean) / self._scaler_std, -5.0, 5.0)

        # Dimensionality reduction: SVD of the data matrix (avoids X.T @ X overflow)
        X = self._fit_reduce(X_std)

        model = GaussianHMM(
            n_components=self.N_STATES,
            covariance_type="diag",
            n_iter=100,
            tol=1e-3,
            min_covar=0.01,
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
        """Number of input assets the HMM was fitted on."""
        return None if self._scaler_mean is None else len(self._scaler_mean)

    # ── private ───────────────────────────────────────────────────────────────

    def _fit_reduce(self, X_std: np.ndarray) -> np.ndarray:
        """
        Reduce (T, N) standardised matrix to (T, K) via SVD.
        K = min(N_FACTORS, N_assets).  Falls back to equal-weight mean if SVD
        fails or produces non-finite values.
        """
        N = X_std.shape[1]
        if N == 1:
            self._factors = None
            return X_std

        K = min(self.N_FACTORS, N)
        X_c = X_std - X_std.mean(axis=0)           # centre columns
        try:
            # economy SVD: U (T×T), S (T,), Vt (T×N) → keep top-K rows of Vt
            _, _, Vt = np.linalg.svd(X_c, full_matrices=False)
            self._factors = Vt[:K].copy()           # (K, N)
            proj = X_c @ self._factors.T            # (T, K)
            if not np.isfinite(proj).all():
                raise ValueError("SVD projection produced non-finite output")
            return proj
        except (np.linalg.LinAlgError, ValueError):
            # Graceful fallback: equal-weight mean of z-scored returns
            self._factors = None
            return X_std.mean(axis=1, keepdims=True)

    def _scale(self, returns: np.ndarray) -> np.ndarray:
        """Apply the same standardise → clip → project pipeline used in fit()."""
        X_raw = np.array(returns if returns.ndim == 2 else returns.reshape(-1, 1),
                         dtype=np.float64)
        X_raw = np.nan_to_num(X_raw, nan=0.0, posinf=0.0, neginf=0.0)

        if self._scaler_mean is None or self._scaler_std is None:
            self._scaler_mean = X_raw.mean(axis=0)
            self._scaler_std  = X_raw.std(axis=0).clip(min=1e-8)

        X_std = np.clip((X_raw - self._scaler_mean) / self._scaler_std, -5.0, 5.0)

        if self._factors is not None:
            X_c = X_std - X_std.mean(axis=0)
            return X_c @ self._factors.T
        if X_std.shape[1] > 1:
            return X_std.mean(axis=1, keepdims=True)
        return X_std

    @staticmethod
    def _canonical_order(means: np.ndarray) -> np.ndarray:
        # means: (N_states, K) — collapse to scalar for ordering
        # order[new_canonical_state] = old_internal_state (NumPy fancy-indexing)
        scalar_means = means.mean(axis=1)
        sorted_idx = np.argsort(scalar_means)[::-1]  # descending
        order = np.empty(3, dtype=int)
        order[0] = sorted_idx[0]  # new 0 (bull)     ← old highest-mean state
        order[1] = sorted_idx[2]  # new 1 (bear)     ← old lowest-mean state
        order[2] = sorted_idx[1]  # new 2 (sideways) ← old middle-mean state
        return order

    def _stabilize_labels(self, new_model: GaussianHMM) -> GaussianHMM:
        """Relabel new states to stay consistent with previous fit (Hungarian algorithm)."""
        old_means = self._prev_means.mean(axis=1)
        new_means = new_model.means_.mean(axis=1)
        cost = np.abs(new_means[:, None] - old_means[None, :])
        row_ind, col_ind = linear_sum_assignment(cost)
        reorder = np.empty(self.N_STATES, dtype=int)
        for k in range(self.N_STATES):
            reorder[col_ind[k]] = row_ind[k]
        return self._reorder(new_model, reorder)

    @staticmethod
    def _reorder(model: GaussianHMM, order: np.ndarray) -> GaussianHMM:
        model.means_ = model.means_[order]
        # covars_ getter calls fill_covars(), expanding 'diag' compact storage
        # (n_components, n_features) → (n_components, n_features, n_features).
        # The setter then rejects that 3-D shape. Reorder the compact storage
        # directly to sidestep the getter/setter shape mismatch.
        model._covars_ = model._covars_[order]
        model.transmat_ = model.transmat_[np.ix_(order, order)]
        model.startprob_ = model.startprob_[order]
        return model
