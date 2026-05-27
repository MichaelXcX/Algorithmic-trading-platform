"""Alpaca Markets integration.

Reads ALPACA_API_KEY, ALPACA_SECRET_KEY, and ALPACA_PAPER from .env.
ALPACA_PAPER defaults to 'true' (paper trading) for safety.

Raises ValueError("ALPACA_NOT_CONFIGURED") when keys are absent so the
API layer can return HTTP 503 and the frontend can show a connect banner.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any


def is_configured() -> bool:
    return bool(os.getenv("ALPACA_API_KEY") and os.getenv("ALPACA_SECRET_KEY"))


def _is_paper() -> bool:
    return os.getenv("ALPACA_PAPER", "true").lower() != "false"


def _get_client():
    try:
        from alpaca.trading.client import TradingClient  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("Install alpaca-py: pip install alpaca-py") from exc

    api_key = os.getenv("ALPACA_API_KEY")
    secret_key = os.getenv("ALPACA_SECRET_KEY")
    if not api_key or not secret_key:
        raise ValueError("ALPACA_NOT_CONFIGURED")

    # ALPACA_BASE_URL pins the endpoint explicitly (e.g. https://paper-api.alpaca.markets).
    # The SDK appends /v2/<path> to this value, so do not include /v2 here.
    url_override = os.getenv("ALPACA_BASE_URL") or None
    return TradingClient(api_key, secret_key, paper=_is_paper(), url_override=url_override)


def get_account() -> dict[str, Any]:
    client = _get_client()
    a = client.get_account()
    equity = float(a.equity or 0)
    last_equity = float(a.last_equity or 0)
    return {
        "equity": equity,
        "last_equity": last_equity,
        "day_pl": equity - last_equity,
        "day_plpc": (equity - last_equity) / last_equity if last_equity else 0.0,
        "buying_power": float(a.buying_power or 0),
        "cash": float(a.cash or 0),
        "portfolio_value": float(a.portfolio_value or 0),
        "status": str(a.status),
        "paper": _is_paper(),
    }


def get_positions() -> list[dict[str, Any]]:
    client = _get_client()
    positions = client.get_all_positions()
    return [
        {
            "symbol": p.symbol,
            "qty": float(p.qty or 0),
            "side": p.side.value if hasattr(p.side, "value") else str(p.side),
            "avg_entry_price": float(p.avg_entry_price or 0),
            "current_price": float(p.current_price or 0),
            "market_value": float(p.market_value or 0),
            "cost_basis": float(p.cost_basis or 0),
            "unrealized_pl": float(p.unrealized_pl or 0),
            "unrealized_plpc": float(p.unrealized_plpc or 0),
            "change_today": float(p.change_today or 0),
        }
        for p in positions
    ]


def seed_portfolio(symbols: list[str], use_fraction: float = 0.9) -> dict[str, Any]:
    """Place equal-weight notional market orders for each symbol.

    Uses DAY time-in-force (required for notional orders by Alpaca).
    Orders queue and execute at next market open if placed outside hours.
    """
    try:
        from alpaca.trading.requests import MarketOrderRequest  # type: ignore[import]
        from alpaca.trading.enums import OrderSide, TimeInForce  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("Install alpaca-py: pip install alpaca-py") from exc

    account = get_account()
    cash = account["cash"]
    if cash <= 0:
        raise ValueError("No cash available in account")

    per_symbol = round((cash * use_fraction) / len(symbols), 2)
    client = _get_client()

    orders: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []

    for symbol in symbols:
        try:
            order_req = MarketOrderRequest(
                symbol=symbol,
                notional=per_symbol,
                side=OrderSide.BUY,
                time_in_force=TimeInForce.DAY,
            )
            order = client.submit_order(order_req)
            orders.append({
                "symbol": symbol,
                "notional": per_symbol,
                "order_id": str(order.id),
                "status": str(order.status),
            })
        except Exception as exc:
            errors.append({"symbol": symbol, "error": str(exc)})

    return {
        "orders": orders,
        "errors": errors,
        "total_deployed": sum(o["notional"] for o in orders),
        "buying_power_before": cash,
    }


def get_portfolio_history(period: str = "1M") -> dict[str, Any]:
    try:
        from alpaca.trading.requests import GetPortfolioHistoryRequest  # type: ignore[import]
    except ImportError as exc:
        raise RuntimeError("Install alpaca-py: pip install alpaca-py") from exc

    client = _get_client()
    history = client.get_portfolio_history(
        history_filter=GetPortfolioHistoryRequest(period=period, timeframe="1D")
    )
    timestamps = [
        datetime.fromtimestamp(ts).strftime("%Y-%m-%d")
        for ts in (history.timestamp or [])
    ]
    equity = [float(v) if v is not None else None for v in (history.equity or [])]
    profit_loss = [float(v) if v is not None else None for v in (history.profit_loss or [])]
    profit_loss_pct = [float(v) if v is not None else None for v in (history.profit_loss_pct or [])]
    return {
        "timestamps": timestamps,
        "equity": equity,
        "profit_loss": profit_loss,
        "profit_loss_pct": profit_loss_pct,
        "base_value": float(history.base_value or 0),
    }
