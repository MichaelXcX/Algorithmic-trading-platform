import os
# Must be set before any library (torch, xgboost, sklearn) initialises its BLAS/OpenMP
# runtime. On macOS Apple Silicon, PyTorch and XGBoost each try to own the OpenMP layer
# and the process segfaults when both are loaded in the same interpreter.
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import logging

from fastapi import FastAPI, Query, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    ForecastResponse,
    RegimeStateResponse,
    LSTMForecastResponse,
    PortfolioRequest,
    PortfolioAllocationResponse,
    TrainRequest,
    AlpacaStatusResponse,
    AlpacaAccountResponse,
    AlpacaPosition,
    AlpacaHistoryResponse,
    AlpacaSeedRequest,
    AlpacaSeedResponse,
    HMMFitRequest,
    HMMStatusResponse,
)
from services.forecast_service import get_stock_forecast
from services import portfolio_service
from services import alpaca_service
from transformers import pipeline
import os

import httpx
from dotenv import load_dotenv

from schemas import ForecastResponse
from services.forecast_service import get_stock_forecast

from schemas import ForecastResponse, SignalResponse, StrategyResponse
from services.forecast_service import get_stock_forecast
from services.signal_classifier_service import get_signal_classification
from services.strategy_selector_service import get_strategy_recommendation

logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI(
    title="Algorithmic Trading Platform API",
    description="Stock forecasting, regime detection, and GNN portfolio optimisation",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_finbert = pipeline(
    "text-classification",
    model="ProsusAI/finbert",
    tokenizer="ProsusAI/finbert",
    top_k=1,
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "query": q}


# ---------------------------------------------------------------------------
# News sentiment (unchanged)
# ---------------------------------------------------------------------------

@app.get("/news/sentiment")
async def get_news_sentiment(
    ticker: str = Query(..., description="Stock ticker or company name (e.g. AAPL, Tesla)")
):
    api_key = os.getenv("NEWS_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="NEWS_API_KEY not configured in .env")

    params = {
        "q": ticker,
        "language": "en",
        "sortBy": "relevancy",
        "pageSize": 20,
        "apiKey": api_key,
    }

    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://newsapi.org/v2/everything",
            params=params,
            timeout=10.0,
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to reach NewsAPI")

    data = resp.json()
    if data.get("status") != "ok":
        raise HTTPException(status_code=502, detail=data.get("message", "NewsAPI error"))

    articles = []
    for article in data.get("articles", []):
        title = article.get("title") or ""
        description = article.get("description") or ""

        # FinBERT acceptă max 512 tokens — trunchiem textul ca să fim siguri
        text = f"{title}. {description}"[:512]

        result = _finbert(text)[0][0]
        label = result["label"].lower()   # "positive", "negative", "neutral"
        score = round(result["score"], 4) # scorul de încredere al labelului prezis

        # Construim scorurile individuale pentru compatibilitate cu frontend-ul
        positive = score if label == "positive" else round((1 - score) / 2, 4)
        negative = score if label == "negative" else round((1 - score) / 2, 4)
        neutral  = score if label == "neutral"  else round((1 - score) / 2, 4)

        # compound: număr între -1 și +1, compatibil cu ce așteaptă frontend-ul
        if label == "positive":
            compound = score
        elif label == "negative":
            compound = -score
        else:
            compound = 0.0

        articles.append({
            "title": title,
            "description": description,
            "url": article.get("url"),
            "source": article.get("source", {}).get("name"),
            "publishedAt": article.get("publishedAt"),
            "urlToImage": article.get("urlToImage"),
            "sentiment": label,
            "compound": round(compound, 4),
            "positive": positive,
            "negative": negative,
            "neutral": neutral,
        })

    return {
        "ticker": ticker,
        "total": len(articles),
        "articles": articles,
    }


@app.get("/forecast/{symbol}", response_model=ForecastResponse)
def forecast_stock(symbol: str):
    try:
        return get_stock_forecast(symbol)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


# ---------------------------------------------------------------------------
# HMM regime
# ---------------------------------------------------------------------------

@app.get("/regime", response_model=RegimeStateResponse)
def get_regime(
    symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,MSFT,GOOGL")
):
    sym_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not sym_list:
        raise HTTPException(status_code=422, detail="Provide at least one symbol")
    try:
        return portfolio_service.get_regime_state(sym_list)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


# ---------------------------------------------------------------------------
# LSTM probabilistic forecast
# ---------------------------------------------------------------------------

@app.get("/forecast/lstm/{symbol}", response_model=LSTMForecastResponse)
def lstm_forecast(symbol: str, n_samples: int = Query(30, ge=10, le=100)):
    try:
        return portfolio_service.get_lstm_forecast(symbol.upper(), n_samples=n_samples)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


# ---------------------------------------------------------------------------
# GNN portfolio optimisation
# ---------------------------------------------------------------------------

@app.post("/portfolio/optimize", response_model=PortfolioAllocationResponse)
def optimize_portfolio(req: PortfolioRequest):
    symbols = [s.strip().upper() for s in req.symbols if s.strip()]
    if len(symbols) < 2:
        raise HTTPException(status_code=422, detail="Provide at least 2 symbols")
    try:
        return portfolio_service.get_portfolio_weights(symbols)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {e}")


# ---------------------------------------------------------------------------
# Walk-forward co-training (runs in background to avoid request timeout)
# ---------------------------------------------------------------------------

_training_status: dict = {"running": False, "last_result": None}


@app.post("/portfolio/train", response_model=dict)
def train_models(req: TrainRequest, background_tasks: BackgroundTasks):
    if _training_status["running"]:
        raise HTTPException(status_code=409, detail="Training already in progress")

    symbols = [s.strip().upper() for s in req.symbols if s.strip()]
    if len(symbols) < 2:
        raise HTTPException(status_code=422, detail="Provide at least 2 symbols")

    def _run():
        _training_status["running"] = True
        try:
            result = portfolio_service.train_models(
                symbols, epochs_per_fold=req.epochs_per_fold
            )
            _training_status["last_result"] = result
        finally:
            _training_status["running"] = False

    background_tasks.add_task(_run)
    return {"status": "training_started", "symbols": symbols}


@app.get("/portfolio/train/status")
def training_status():
    return {
        "running": _training_status["running"],
        "last_result": _training_status.get("last_result"),
    }


# ---------------------------------------------------------------------------
# HMM fitting (non-blocking)
# ---------------------------------------------------------------------------

_hmm_fit_status_global: dict = {"running": False}


@app.post("/hmm/fit")
def hmm_fit(req: HMMFitRequest, background_tasks: BackgroundTasks):
    status = portfolio_service.get_hmm_status()
    if status["running"]:
        raise HTTPException(status_code=409, detail="HMM fitting already in progress")
    symbols = [s.strip().upper() for s in req.symbols if s.strip()]
    if len(symbols) < 2:
        raise HTTPException(status_code=422, detail="Provide at least 2 symbols")
    background_tasks.add_task(portfolio_service.fit_hmm, symbols)
    return {"status": "fitting_started", "symbols": symbols}


@app.get("/hmm/fit/status", response_model=HMMStatusResponse)
def hmm_fit_status():
    return portfolio_service.get_hmm_status()


# ---------------------------------------------------------------------------
# MLflow runs
# ---------------------------------------------------------------------------

@app.get("/mlflow/runs")
def mlflow_runs(n: int = Query(20, ge=1, le=100)):
    try:
        import mlflow
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=portfolio_service.MLFLOW_URI)
        exp = client.get_experiment_by_name("algorithmic_trading")
        if exp is None:
            return []
        runs = client.search_runs(
            experiment_ids=[exp.experiment_id],
            order_by=["start_time DESC"],
            max_results=n,
        )
        return [
            {
                "run_id": r.info.run_id,
                "run_name": r.info.run_name or "",
                "status": r.info.status,
                "start_time": r.info.start_time,
                "end_time": r.info.end_time,
                "params": dict(r.data.params),
                "metrics": dict(r.data.metrics),
            }
            for r in runs
        ]
    except Exception as e:
        logger.warning("MLflow runs fetch failed: %s", e)
        return []


@app.get("/mlflow/runs/{run_id}/history")
def mlflow_run_history(run_id: str, metric: str = Query("train_loss")):
    try:
        import mlflow
        from mlflow.tracking import MlflowClient
        client = MlflowClient(tracking_uri=portfolio_service.MLFLOW_URI)
        history = client.get_metric_history(run_id, metric)
        return [{"step": h.step, "value": h.value} for h in history]
    except Exception as e:
        logger.warning("MLflow history fetch failed: %s", e)
        return []


# ---------------------------------------------------------------------------
# Alpaca Markets
# ---------------------------------------------------------------------------

def _alpaca_error(exc: Exception) -> HTTPException:
    msg = str(exc)
    if "ALPACA_NOT_CONFIGURED" in msg:
        return HTTPException(status_code=503, detail="ALPACA_NOT_CONFIGURED")
    return HTTPException(status_code=500, detail=f"Alpaca error: {msg}")


@app.get("/alpaca/status", response_model=AlpacaStatusResponse)
def alpaca_status():
    configured = alpaca_service.is_configured()
    return {"configured": configured, "paper": True if not configured else alpaca_service._is_paper()}


@app.get("/alpaca/account", response_model=AlpacaAccountResponse)
def alpaca_account():
    try:
        return alpaca_service.get_account()
    except Exception as exc:
        raise _alpaca_error(exc)


@app.get("/alpaca/positions", response_model=list[AlpacaPosition])
def alpaca_positions():
    try:
        return alpaca_service.get_positions()
    except Exception as exc:
        raise _alpaca_error(exc)


@app.get("/alpaca/history", response_model=AlpacaHistoryResponse)
def alpaca_history(period: str = Query("1M", description="e.g. 1D 1W 1M 3M 6M 1A")):
    try:
        return alpaca_service.get_portfolio_history(period)
    except Exception as exc:
        raise _alpaca_error(exc)


@app.get("/stocks/sp500/sectors")
def sp500_sectors():
    from services.stocks_service import get_sp500_by_sector
    return get_sp500_by_sector()


@app.post("/alpaca/seed", response_model=AlpacaSeedResponse)
def alpaca_seed(req: AlpacaSeedRequest):
    symbols = [s.strip().upper() for s in req.symbols if s.strip()]
    if not symbols:
        raise HTTPException(status_code=422, detail="Provide at least one symbol")
    try:
        return alpaca_service.seed_portfolio(symbols, use_fraction=req.use_fraction, weights=req.weights)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise _alpaca_error(exc)


@app.delete("/alpaca/positions")
def alpaca_liquidate():
    try:
        return alpaca_service.liquidate_all()
    except Exception as exc:
        raise _alpaca_error(exc)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare internă: {str(e)}")


@app.get("/signal/{symbol}", response_model=SignalResponse)
def classify_signal(symbol: str):
    try:
        return get_signal_classification(symbol)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare internă: {str(e)}")


@app.get("/strategy/{symbol}", response_model=StrategyResponse)
def select_strategy(symbol: str):
    try:
        return get_strategy_recommendation(symbol)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare internă: {str(e)}")
