# STOCK FORECAST BACKEND (FastAPI)

## 1. DESCRIERE PROIECT

Acest modul reprezintă backend-ul pentru funcționalitatea de **stock
forecasting** din cadrul aplicației de Algorithmic Trading.

Rolul acestui serviciu este: - să primească un simbol bursier (ex: AAPL,
TSLA, MSFT) - să descarce date istorice reale - să aplice un model de
Machine Learning - să returneze predicții pentru zilele următoare

Backend-ul este implementat în Python folosind FastAPI.

------------------------------------------------------------------------

## 2. CE ESTE STOCK FORECASTING

Stock forecasting = estimarea valorii viitoare a unei acțiuni pe baza
datelor istorice.

Exemplu: - avem prețuri din trecut - modelul analizează trendul -
prezice valori pentru zilele următoare

În acest proiect folosim: - regresie liniară (Linear Regression) - un
model simplu care identifică trendul (creștere/scădere)

------------------------------------------------------------------------

## 3. STRUCTURA PROIECTULUI

    stock-forecast-backend/
    │
    ├── app/
    │   ├── main.py                 -> definește API-ul
    │   ├── schemas.py              -> structura răspunsului JSON
    │   └── services/
    │       └── forecast_service.py -> logica de ML (forecasting)
    │
    ├── requirements.txt
    └── README.md

------------------------------------------------------------------------

## 4. CUM FUNCȚIONEAZĂ

Fluxul este următorul:

1.  Se face request:

        GET /forecast/{symbol}

2.  Backend-ul:

    -   descarcă date istorice (yfinance)
    -   extrage prețurile de închidere (Close)
    -   transformă datele într-un format numeric

3.  Modelul:

    -   antrenează un model de regresie liniară
    -   detectează trendul

4.  Se generează predicții:

    -   pentru următoarele 7 zile

5.  Se returnează un JSON cu:

    -   date istorice
    -   predicții

------------------------------------------------------------------------

## 5. FORMATUL RĂSPUNSULUI

Exemplu:

``` json
{
  "symbol": "AAPL",
  "historical_dates": [...],
  "historical_prices": [...],
  "forecast_dates": [...],
  "forecast_prices": [...]
}
```

Explicații: - `historical_*` → date reale din trecut - `forecast_*` →
predicțiile modelului

------------------------------------------------------------------------

## 6. CUM SE RULEAZĂ PROIECTUL

``` bash
cd stock-forecast-backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

------------------------------------------------------------------------

## 7. CUM SE TESTEAZĂ

Deschide în browser:

    http://127.0.0.1:8000/docs

Pași: - găsești endpoint-ul `GET /forecast/{symbol}` - apeși **Try it
out** - introduci un simbol (ex: AAPL) - apeși **Execute**

------------------------------------------------------------------------

## 8. TEST DIRECT ÎN BROWSER

    http://127.0.0.1:8000/forecast/AAPL
    http://127.0.0.1:8000/forecast/TSLA
    http://127.0.0.1:8000/forecast/MSFT

------------------------------------------------------------------------

## 9. CE ÎNSEAMNĂ 200 OK

Dacă vezi:

    200 OK

înseamnă: - request-ul a reușit - backend-ul a funcționat corect -
datele au fost generate

------------------------------------------------------------------------

## 10. LIMITĂRI

Modelul folosit este simplu: - regresie liniară - nu ține cont de
volatilitatea reală a pieței

Este suficient pentru: - demo - vizualizare - integrare frontend

------------------------------------------------------------------------

## 11. ROLUL ACESTUI MODUL

Acest backend este responsabil pentru: - partea de Machine Learning -
generarea predicțiilor

Frontend-ul (React): - preia datele - le afișează în grafice

------------------------------------------------------------------------

## 12. EXPLICAȚIE SIMPLĂ (PENTRU PREZENTARE)

Acest serviciu primește un simbol bursier, descarcă date istorice și
aplică un model de regresie liniară pentru a estima valorile viitoare,
pe care le returnează sub formă de JSON pentru a fi vizualizate în
frontend.
