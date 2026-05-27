import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  CButton,
  CFormInput,
  CSpinner,
  CAlert,
} from '@coreui/react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { lstmApi, forecastApi } from '../services/api'
import type { LSTMForecastResponse, LinearForecastResponse, RegimeName } from '../services/api'

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg:      '#0a0e1a',
  card:    '#0f1623',
  border:  '#1e2433',
  text:    '#e2e8f0',
  muted:   '#64748b',
  bull:    '#10b981',
  bear:    '#ef4444',
  sideways:'#eab308',
} as const

// ── Types ──────────────────────────────────────────────────────────────────────
type ForecastData = LinearForecastResponse

interface Signal {
  label:       string
  color:       string
  glowColor:   string
  description: string
  strength:    number
}

// ── Signal logic ───────────────────────────────────────────────────────────────
const REGIME_META: Record<RegimeName, { label: string; icon: string; color: string }> = {
  bull:     { label: 'Bull',     icon: '📈', color: '#10b981' },
  bear:     { label: 'Bear',     icon: '📉', color: '#ef4444' },
  sideways: { label: 'Sideways', icon: '↔️', color: '#eab308' },
}

function getSignal(mu: number, uncertainty: number): Signal {
  if (uncertainty > 0.015) {
    return {
      label:       'SKIP TRADE',
      color:       C.muted,
      glowColor:   'rgba(100,116,139,0.12)',
      description: 'Epistemic uncertainty exceeds skip-trade threshold — no edge',
      strength:    0,
    }
  }
  const clarityFactor = Math.min(1, 1 - uncertainty / 0.015)
  const magnitudeFactor = Math.min(1, Math.abs(mu) / 0.01)
  const strength = clarityFactor * magnitudeFactor

  if (mu > 0.008)  return { label: 'STRONG BUY',  color: C.bull,      glowColor: 'rgba(16,185,129,0.15)', description: 'High-conviction long signal — momentum favors entry', strength }
  if (mu > 0.003)  return { label: 'BUY',          color: '#34d399',   glowColor: 'rgba(52,211,153,0.10)', description: 'Moderate bullish signal — consider long position', strength }
  if (mu < -0.008) return { label: 'STRONG SELL',  color: C.bear,      glowColor: 'rgba(239,68,68,0.15)',  description: 'High-conviction short signal — exit or hedge', strength }
  if (mu < -0.003) return { label: 'SELL',         color: '#f87171',   glowColor: 'rgba(248,113,113,0.10)',description: 'Moderate bearish signal — reduce exposure', strength }
  return              { label: 'HOLD',          color: C.sideways,  glowColor: 'rgba(234,179,8,0.10)',  description: 'No directional edge — stay neutral or wait', strength }
}

// ── Conviction arc (SVG) ───────────────────────────────────────────────────────
const ConvictionArc: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const r = 34
  const cx = 44
  const cy = 44
  const circumference = 2 * Math.PI * r
  const dash = value * circumference

  return (
    <svg width={88} height={88} viewBox="0 0 88 88" style={{ display: 'block' }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.border} strokeWidth={7} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={7}
        strokeDasharray={`${dash} ${circumference}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: 'stroke-dasharray 0.7s ease' }}
      />
      <text
        x={cx} y={cy - 5}
        textAnchor="middle"
        fill={color}
        fontSize={17}
        fontWeight={700}
        fontFamily="'Courier New', monospace"
      >
        {Math.round(value * 100)}%
      </text>
      <text
        x={cx} y={cy + 11}
        textAnchor="middle"
        fill={C.muted}
        fontSize={9}
        fontFamily="sans-serif"
        letterSpacing={1}
      >
        CONVICTION
      </text>
    </svg>
  )
}

// ── LSTM hero card ─────────────────────────────────────────────────────────────
const LSTMResultCard: React.FC<{ data: LSTMForecastResponse }> = ({ data }) => {
  const sigma = Math.exp(data.log_sigma)
  const lo = data.mean_return - 2 * sigma
  const hi = data.mean_return + 2 * sigma
  const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(3)}%`
  const signal = getSignal(data.mean_return, data.uncertainty)
  const regime = REGIME_META[data.regime_name]

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 24,
        boxShadow: `0 0 40px ${signal.glowColor}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.muted, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
            LSTM Probabilistic Forecast
          </span>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>
            {data.symbol}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: `${regime.color}18`,
            border: `1px solid ${regime.color}44`,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            color: regime.color,
            fontWeight: 600,
          }}
        >
          {regime.icon} {regime.label} Regime
        </div>
      </div>

      {/* Hero row: signal + conviction */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '24px 28px 20px',
          borderBottom: `1px solid ${C.border}`,
          background: signal.glowColor,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 32,
              fontWeight: 800,
              color: signal.color,
              letterSpacing: -0.5,
              lineHeight: 1,
              marginBottom: 8,
              textShadow: `0 0 24px ${signal.color}88`,
            }}
          >
            {signal.label}
          </div>
          <div style={{ color: C.muted, fontSize: 13, lineHeight: 1.5 }}>
            {signal.description}
          </div>
          {/* Signal strength bar */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1 }}>SIGNAL STRENGTH</span>
              <span style={{ fontSize: 10, color: signal.color, fontFamily: 'monospace' }}>
                {Math.round(signal.strength * 100)} / 100
              </span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: C.border, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${signal.strength * 100}%`,
                  background: signal.color,
                  borderRadius: 2,
                  transition: 'width 0.6s ease',
                  boxShadow: `0 0 8px ${signal.color}`,
                }}
              />
            </div>
          </div>
        </div>
        <ConvictionArc value={signal.strength} color={signal.color} />
      </div>

      {/* Metric cells */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          borderTop: `1px solid ${C.border}`,
        }}
      >
        {/* μ return */}
        <div
          style={{
            padding: '18px 20px',
            borderRight: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginBottom: 6 }}>
            MEAN RETURN (μ)
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: data.mean_return >= 0 ? C.bull : C.bear,
              fontFamily: "'Courier New', monospace",
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            {fmtPct(data.mean_return)}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>5-bar forecast horizon</div>
        </div>

        {/* Uncertainty */}
        <div
          style={{
            padding: '18px 20px',
            borderRight: `1px solid ${C.border}`,
          }}
        >
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginBottom: 6 }}>
            EPISTEMIC UNCERTAINTY
          </div>
          <div
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: data.uncertainty > 0.015 ? C.bear : data.uncertainty > 0.008 ? C.sideways : C.bull,
              fontFamily: "'Courier New', monospace",
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1,
            }}
          >
            ±{(data.uncertainty * 100).toFixed(3)}%
          </div>
          <div
            style={{
              fontSize: 10,
              color: data.uncertainty > 0.015 ? C.bear : C.muted,
              marginTop: 4,
            }}
          >
            {data.uncertainty > 0.015 ? 'Above skip-trade threshold' : 'MC-dropout 30 samples'}
          </div>
        </div>

        {/* 95% confidence */}
        <div style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginBottom: 6 }}>
            95% CONFIDENCE (μ ± 2σ)
          </div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: C.text,
              fontFamily: "'Courier New', monospace",
              fontVariantNumeric: 'tabular-nums',
              lineHeight: 1.3,
            }}
          >
            <span style={{ color: C.bear }}>{fmtPct(lo)}</span>
            <span style={{ color: C.muted, margin: '0 6px' }}>→</span>
            <span style={{ color: C.bull }}>{fmtPct(hi)}</span>
          </div>
          <div style={{ marginTop: 10, height: 4, borderRadius: 2, background: C.border, position: 'relative', overflow: 'hidden' }}>
            {(() => {
              const range = 0.08
              const leftPct = Math.max(0, ((lo + range / 2) / range) * 100)
              const widthPct = Math.min(100, ((hi - lo) / range) * 100)
              return (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    height: '100%',
                    background: `linear-gradient(90deg, ${C.bear}, ${C.bull})`,
                    borderRadius: 2,
                    opacity: 0.8,
                  }}
                />
              )
            })()}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Price forecast chart ───────────────────────────────────────────────────────
const ForecastChart: React.FC<{ data: ForecastData }> = ({ data }) => {
  const chartData = [
    ...data.historical_dates.map((date, i) => ({
      date,
      historical: data.historical_prices[i],
      forecast: null as number | null,
    })),
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

  const boundaryDate = data.historical_dates[data.historical_dates.length - 1]
  const lastHistorical = data.historical_prices[data.historical_prices.length - 1]
  const lastForecast = data.forecast_prices[data.forecast_prices.length - 1]
  const forecastUp = lastForecast >= lastHistorical

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '14px 20px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: C.muted, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' }}>
            Linear Regression Forecast
          </span>
          <span style={{ color: C.text, fontWeight: 700, fontSize: 15 }}>{data.symbol}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span style={{ color: C.muted }}>
            <span style={{ display: 'inline-block', width: 24, borderTop: '2px solid #4dabf7', verticalAlign: 'middle', marginRight: 6 }} />
            Historical
          </span>
          <span style={{ color: C.muted }}>
            <span style={{ display: 'inline-block', width: 24, borderTop: '2px dashed #51cf66', verticalAlign: 'middle', marginRight: 6 }} />
            Forecast
          </span>
          <span
            style={{
              background: forecastUp ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
              border: `1px solid ${forecastUp ? C.bull : C.bear}44`,
              borderRadius: 12,
              padding: '2px 10px',
              color: forecastUp ? C.bull : C.bear,
              fontFamily: 'monospace',
              fontWeight: 600,
            }}
          >
            {forecastUp ? '↑' : '↓'} ${lastForecast.toFixed(2)}
          </span>
        </div>
      </div>

      <div style={{ padding: '16px 8px 8px' }}>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: C.muted, fontSize: 11 }}
              axisLine={{ stroke: C.border }}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={50}
            />
            <YAxis
              tick={{ fill: C.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
              labelStyle={{ color: C.muted, fontSize: 11, marginBottom: 4 }}
              formatter={(value) => [`$${Number(value).toFixed(2)}`, undefined]}
            />
            {boundaryDate && (
              <ReferenceLine
                x={boundaryDate}
                stroke={C.muted}
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
            )}
            <Line
              type="monotone"
              dataKey="historical"
              stroke="#4dabf7"
              strokeWidth={2}
              dot={false}
              name="Historical"
              connectNulls={false}
            />
            <Line
              type="monotone"
              dataKey="forecast"
              stroke="#51cf66"
              strokeDasharray="6 3"
              strokeWidth={2}
              dot={false}
              name="Forecast"
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
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
      const json = await forecastApi.getForecast(trimmed)
      setData(json)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const lstmMutation = useMutation({
    mutationFn: () => lstmApi.getForecast(symbol.trim().toUpperCase()),
  })

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '28px 32px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            color: C.text,
            fontSize: 22,
            fontWeight: 700,
            margin: 0,
            letterSpacing: -0.3,
          }}
        >
          Stock Forecasting
        </h1>
        <p style={{ color: C.muted, fontSize: 13, margin: '4px 0 0' }}>
          Linear regression · LSTM probabilistic forecast with epistemic uncertainty
        </p>
      </div>

      {/* Input row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 28,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          padding: '12px 16px',
        }}
      >
        <CFormInput
          placeholder="Enter symbol (e.g. AAPL)"
          value={symbol}
          onChange={e => setSymbol(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleForecast()}
          style={{
            width: 220,
            background: C.bg,
            border: `1px solid ${C.border}`,
            color: C.text,
            borderRadius: 7,
          }}
        />
        <CButton
          color="primary"
          onClick={handleForecast}
          disabled={loading || !symbol.trim()}
          style={{ minWidth: 110 }}
        >
          {loading ? <CSpinner size="sm" /> : 'Price Forecast'}
        </CButton>
        <CButton
          style={{
            minWidth: 130,
            background: 'transparent',
            border: `1px solid ${C.border}`,
            color: lstmMutation.isPending ? C.muted : C.text,
          }}
          onClick={() => lstmMutation.mutate()}
          disabled={lstmMutation.isPending || !symbol.trim()}
        >
          {lstmMutation.isPending ? (
            <><CSpinner size="sm" className="me-2" />Running LSTM…</>
          ) : (
            'LSTM Signal'
          )}
        </CButton>
        <span style={{ color: C.muted, fontSize: 12, marginLeft: 4 }}>
          Press Enter for price forecast · LSTM runs MC-dropout
        </span>
      </div>

      {error && (
        <CAlert color="danger" className="mb-4">{error}</CAlert>
      )}
      {lstmMutation.isError && (
        <CAlert color="warning" className="mb-4">
          {(lstmMutation.error as Error).message}
        </CAlert>
      )}

      {/* LSTM hero (shown first when available) */}
      {lstmMutation.data && <LSTMResultCard data={lstmMutation.data} />}

      {/* Linear forecast chart */}
      {data && <ForecastChart data={data} />}

      {/* Empty state */}
      {!data && !lstmMutation.data && !loading && !lstmMutation.isPending && (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 32px',
            color: C.muted,
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.4 }}>📊</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            Enter a symbol to begin
          </div>
          <div style={{ fontSize: 13 }}>
            Price Forecast runs a linear regression model · LSTM Signal runs probabilistic forecasting with MC-dropout uncertainty estimation
          </div>
        </div>
      )}
    </div>
  )
}

export default StockForcasting
