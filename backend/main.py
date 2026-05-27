from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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

load_dotenv()

app = FastAPI(
    title="Algorithmic Trading Platform API",
    description="API pentru predicții bursiere, clasificare semnale și selecție strategii",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FinBERT se încarcă o singură dată la startup
print("Se încarcă modelul FinBERT...")
_finbert = pipeline(
    "text-classification",
    model="ProsusAI/finbert",
    tokenizer="ProsusAI/finbert",
    device=-1  # CPU; schimbă în 0 dacă ai GPU
)
print("FinBERT încărcat!")


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "query": q}


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
        raise HTTPException(status_code=502, detail=data.get("message", "NewsAPI returned an error"))

    articles = []
    for article in data.get("articles", []):
        title = article.get("title") or ""
        description = article.get("description") or ""

        # FinBERT acceptă max 512 tokens — trunchiem textul ca să fim siguri
        text = f"{title}. {description}"[:512]

        result = _finbert(text)[0]
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