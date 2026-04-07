from pydantic import BaseModel
from typing import List


class ForecastResponse(BaseModel):
    symbol: str
    historical_dates: List[str]
    historical_prices: List[float]
    forecast_dates: List[str]
    forecast_prices: List[float]