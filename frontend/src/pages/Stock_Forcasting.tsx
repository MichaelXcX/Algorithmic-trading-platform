import React, { useState } from 'react'
import {
  CButton,
  CFormInput,
  CSpinner,
  CAlert,
  CCard,
  CCardBody,
  CCardHeader,
  CRow,
  CCol,
} from '@coreui/react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface ForecastData {
  symbol: string
  historical_dates: string[]
  historical_prices: number[]
  forecast_dates: string[]
  forecast_prices: number[]
}

const StockForcasting: React.FC = () => {
  const [symbol, setSymbol] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<ForecastData | null>(null)

  const handleForecast = async () => {
    const trimmed = symbol.trim().toUpperCase()
    if (!trimmed) return

    setLoading(true)
    setError(null)
    setData(null)

    try {
      const res = await fetch(`/api/forecast/${encodeURIComponent(trimmed)}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.detail ?? `Request failed (${res.status})`)
      }
      const json: ForecastData = await res.json()
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const chartData = data
    ? [
        ...data.historical_dates.map((date, i) => ({
          date,
          historical: data.historical_prices[i],
          forecast: null as number | null,
        })),
        // bridge point so lines connect
        {
          date: data.historical_dates[data.historical_dates.length - 1],
          historical: null as number | null,
          forecast: data.historical_prices[data.historical_prices.length - 1],
        },
        ...data.forecast_dates.map((date, i) => ({
          date,
          historical: null as number | null,
          forecast: data.forecast_prices[i],
        })),
      ]
    : []

  const boundaryDate = data
    ? data.historical_dates[data.historical_dates.length - 1]
    : undefined

  return (
    <div className="p-4 bg-dark border border-secondary rounded">
      <h1 className="text-white mb-4">Stock Forecasting</h1>

      <CRow className="mb-4 align-items-end g-3">
        <CCol xs="auto">
          <CFormInput
            placeholder="Enter symbol (e.g. AAPL)"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleForecast()}
            style={{ width: 220 }}
          />
        </CCol>
        <CCol xs="auto">
          <CButton color="primary" onClick={handleForecast} disabled={loading || !symbol.trim()}>
            {loading ? <CSpinner size="sm" /> : 'Forecast'}
          </CButton>
        </CCol>
      </CRow>

      {error && <CAlert color="danger">{error}</CAlert>}

      {data && (
        <CCard className="bg-dark border-secondary">
          <CCardHeader className="text-white">
            <strong>{data.symbol}</strong> — 6-month history + 7-day forecast
          </CCardHeader>
          <CCardBody>
            <ResponsiveContainer width="100%" height={420}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#ccc', fontSize: 11 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: '#ccc' }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#222', border: '1px solid #555' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
                />
                <Legend />
                {boundaryDate && (
                  <ReferenceLine x={boundaryDate} stroke="#888" strokeDasharray="4 4" label="" />
                )}
                <Line
                  type="monotone"
                  dataKey="historical"
                  stroke="#4dabf7"
                  dot={false}
                  name="Historical"
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="forecast"
                  stroke="#51cf66"
                  strokeDasharray="6 3"
                  dot={false}
                  name="Forecast"
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CCardBody>
        </CCard>
      )}
    </div>
  )
}

export default StockForcasting