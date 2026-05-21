from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import ForecastResponse
from services.forecast_service import get_stock_forecast
import os
import httpx
from dotenv import load_dotenv
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

load_dotenv()
app = FastAPI(
    title="Stock Forecast API",
    description="API simplu pentru predicția prețurilor acțiunilor",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_analyzer = SentimentIntensityAnalyzer()


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str = None):
    return {"item_id": item_id, "query": q}


@app.get("/news/sentiment")
async def get_news_sentiment(
    ticker: str = Query(..., description="Stock ticker or company name (e.g. AAPL, Tesla)")  # noqa: F821
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
        text = f"{title}. {description}"

        scores = _analyzer.polarity_scores(text)
        compound = scores["compound"]

        if compound >= 0.05:
            sentiment = "positive"
        elif compound <= -0.05:
            sentiment = "negative"
        else:
            sentiment = "neutral"

        articles.append({
            "title": title,
            "description": description,
            "url": article.get("url"),
            "source": article.get("source", {}).get("name"),
            "publishedAt": article.get("publishedAt"),
            "urlToImage": article.get("urlToImage"),
            "sentiment": sentiment,
            "compound": round(compound, 4),
            "positive": round(scores["pos"], 4),
            "negative": round(scores["neg"], 4),
            "neutral": round(scores["neu"], 4),
        })

    return {
        "ticker": ticker,
        "total": len(articles),
        "articles": articles,
    }
@app.get("/forecast/{symbol}", response_model=ForecastResponse)
def forecast_stock(symbol: str):
    try:
        result = get_stock_forecast(symbol)
        return result
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Eroare internă: {str(e)}")
