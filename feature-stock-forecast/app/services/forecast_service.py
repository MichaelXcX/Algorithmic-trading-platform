import numpy as np
import pandas as pd
import yfinance as yf
from datetime import timedelta
from sklearn.linear_model import LinearRegression


def get_stock_forecast(symbol: str, history_period: str = "6mo", forecast_days: int = 7):
    """
    Descarcă date istorice pentru un simbol bursier,
    antrenează un model simplu de regresie liniară
    și prezice următoarele 'forecast_days' zile.
    """

    # Descărcăm datele istorice
    data = yf.download(symbol, period=history_period, auto_adjust=True)

    if data.empty:
        raise ValueError(f"Nu am găsit date pentru simbolul '{symbol}'.")

    # Ne asigurăm că avem coloana Close
    if "Close" not in data.columns:
        raise ValueError("Datele descărcate nu conțin coloana 'Close'.")

    close_prices = data["Close"].dropna()

    if len(close_prices) < 10:
        raise ValueError("Nu există suficiente date istorice pentru predicție.")

    # Resetăm indexul și păstrăm și datele calendaristice
    df = close_prices.reset_index()

    # Redenumim coloanele ca să fie simple și clare
    df.columns = ["date", "close"]

    # Coloana numerică folosită de model
    df["day_index"] = np.arange(len(df))

    # Date de antrenare
    X = df[["day_index"]]
    y = df["close"]

    # Model simplu
    model = LinearRegression()
    model.fit(X, y)

    # Predicție pentru următoarele zile
    future_day_indexes = np.arange(len(df), len(df) + forecast_days)
    forecast_prices = model.predict(future_day_indexes.reshape(-1, 1))

    # Pregătim datele istorice pentru răspuns
    historical_dates = [d.strftime("%Y-%m-%d") for d in df["date"]]
    historical_prices = [float(round(price, 2)) for price in df["close"]]

    # Construim datele viitoare
    last_date = df["date"].iloc[-1]
    forecast_dates = [
        (last_date + timedelta(days=i)).strftime("%Y-%m-%d")
        for i in range(1, forecast_days + 1)
    ]
    forecast_prices = [float(round(price, 2)) for price in forecast_prices]

    return {
        "symbol": symbol.upper(),
        "historical_dates": historical_dates,
        "historical_prices": historical_prices,
        "forecast_dates": forecast_dates,
        "forecast_prices": forecast_prices,
    }