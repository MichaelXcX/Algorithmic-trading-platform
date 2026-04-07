from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.schemas import ForecastResponse
from app.services.forecast_service import get_stock_forecast

app = FastAPI(
    title="Stock Forecast API",
    description="API simplu pentru predicția prețurilor acțiunilor",
    version="1.0.0"
)

# CORS - util pentru colegul care va conecta frontend-ul
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "Stock Forecast API is running"
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