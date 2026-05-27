import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CSpinner } from '@coreui/react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Cell,
} from 'recharts'
import { signalApi, type SignalResponse } from '../services/api'

// ── Colour helpers ────────────────────────────────────────────────────────────

const SIGNAL_COLORS: Record<string, string> = {
  BUY: '#10b981',
  SELL: '#ef4444',
  HOLD: '#eab308',
}

const SIGNAL_BG: Record<string, string> = {
  BUY: 'rgba(16,185,129,0.15)',
  SELL: 'rgba(239,68,68,0.15)',
  HOLD: 'rgba(234,179,8,0.15)',
}

const SIGNAL_BORDER: Record<string, string> = {
  BUY: 'rgba(16,185,129,0.4)',
  SELL: 'rgba(239,68,68,0.4)',
  HOLD: 'rgba(234,179,8,0.4)',
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface InfoCardProps {
  label: string
  value: string | number
  color?: string
  sub?: string
}

const InfoCard: React.FC<InfoCardProps> = ({ label, value, color = '#f3f4f6', sub }) => (
  <div
    style={{
      background: '#1e1f27',
      border: '1px solid #2e303a',
      borderRadius: 10,
      padding: '14px 18px',
      textAlign: 'center',
      flex: 1,
    }}
  >
    <div style={{ color, fontSize: 20, fontWeight: 700 }}>{value}</div>
    {sub && <div style={{ color, fontSize: 12, marginTop: 2, opacity: 0.8 }}>{sub}</div>}
    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{label}</div>
  </div>
)

interface SignalBadgeProps {
  signal: string
  confidence: number
  accuracy: number
}

const SignalBadge: React.FC<SignalBadgeProps> = ({ signal, confidence, accuracy }) => (
  <div
    style={{
      background: SIGNAL_BG[signal] ?? 'rgba(255,255,255,0.1)',
      border: `2px solid ${SIGNAL_BORDER[signal] ?? '#555'}`,
      borderRadius: 16,
      padding: '28px 40px',
      textAlign: 'center',
      flex: 1,
      minWidth: 200,
    }}
  >
    <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 8 }}>Current Signal</div>
    <div
      style={{
        color: SIGNAL_COLORS[signal] ?? '#fff',
        fontSize: 52,
        fontWeight: 900,
        letterSpacing: 2,
        lineHeight: 1,
      }}
    >
      {signal}
    </div>
    <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 12 }}>
      Confidence: <strong style={{ color: SIGNAL_COLORS[signal] }}>{(confidence * 100).toFixed(1)}%</strong>
    </div>
    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>
      Model accuracy: {(accuracy * 100).toFixed(1)}%
    </div>
  </div>
)

// ── Type for Recharts dot render function payload ─────────────────────────────

interface SignalPayload {
  signal: string
  date: string
  price: number
}

// ── Main page ─────────────────────────────────────────────────────────────────

const SignalClassifier: React.FC = () => {
  const [input, setInput] = useState('')
  const [symbol, setSymbol] = useState('')

  const { data, isLoading, isError, error } = useQuery<SignalResponse, Error>({
    queryKey: ['signal', symbol],
    queryFn: () => signalApi.getSignal(symbol),
    enabled: symbol.length > 0,
  })

  const handleAnalyze = () => {
    const t = input.trim().toUpperCase()
    if (t) setSymbol(t)
  }

  // Build chart data: price line with signal info per point
  const chartData = data
    ? data.recent_signals.map((p) => ({
        date: p.date,
        price: p.close_price,
        signal: p.signal,
      }))
    : []

  // Feature importance (top 8)
  const topFeatures = data ? data.feature_importances.slice(0, 8) : []

  const ti = data?.technical_indicators

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000 }}>
      <h1 style={{ color: '#f3f4f6', marginBottom: 4 }}>Signal Classifier</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>
        XGBoost model that classifies the current trading signal (BUY / SELL / HOLD) using
        technical indicators
      </p>

      {/* Search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAnalyze()}
          placeholder="Enter stock ticker (e.g. AAPL, MSFT, TSLA)"
          style={{
            flex: 1,
            background: '#1e1f27',
            border: '1px solid #2e303a',
            borderRadius: 8,
            padding: '10px 16px',
            color: '#f3f4f6',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <button
          onClick={handleAnalyze}
          disabled={isLoading || !input.trim()}
          style={{
            background: '#4dabf7',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            color: '#16171d',
            fontWeight: 700,
            fontSize: 15,
            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: isLoading || !input.trim() ? 0.6 : 1,
          }}
        >
          {isLoading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#9ca3af' }}>
          <CSpinner size="sm" />
          Training XGBoost and computing signals… (this may take ~15 seconds)
        </div>
      )}

      {/* Error */}
      {isError && (
        <div
          style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            padding: '12px 16px',
            color: '#ef4444',
          }}
        >
          {error.message}
        </div>
      )}

      {data && (
        <>
          {/* Row 1: Signal badge + technical indicators */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            <SignalBadge
              signal={data.current_signal}
              confidence={data.confidence}
              accuracy={data.model_accuracy}
            />

            {ti && (
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 2 }}>
                  Technical Indicators
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <InfoCard
                    label="RSI (14)"
                    value={ti.rsi.toFixed(1)}
                    color={ti.rsi > 70 ? '#ef4444' : ti.rsi < 30 ? '#10b981' : '#f3f4f6'}
                    sub={ti.rsi > 70 ? 'Overbought' : ti.rsi < 30 ? 'Oversold' : 'Neutral'}
                  />
                  <InfoCard label="MACD" value={ti.macd.toFixed(3)} color={ti.macd >= 0 ? '#10b981' : '#ef4444'} />
                  <InfoCard label="MACD Signal" value={ti.macd_signal.toFixed(3)} />
                  <InfoCard label="SMA 20" value={`$${ti.sma20.toFixed(2)}`} />
                  <InfoCard label="SMA 50" value={`$${ti.sma50.toFixed(2)}`} />
                  <InfoCard label="BB Upper" value={`$${ti.bb_upper.toFixed(2)}`} />
                  <InfoCard label="BB Lower" value={`$${ti.bb_lower.toFixed(2)}`} />
                  <InfoCard
                    label="Volume Ratio"
                    value={ti.volume_ratio.toFixed(2) + '×'}
                    color={ti.volume_ratio > 1.5 ? '#c084fc' : '#f3f4f6'}
                    sub={ti.volume_ratio > 1.5 ? 'High volume' : ''}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Recent signal chart */}
          <div
            style={{
              background: '#1e1f27',
              border: '1px solid #2e303a',
              borderRadius: 10,
              padding: '20px 24px',
              marginBottom: 20,
            }}
          >
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 6 }}>
              Recent Price + Signals (last 30 days)
            </div>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 14 }}>
              Dots: <span style={{ color: '#10b981' }}>● BUY</span>{' '}
              <span style={{ color: '#ef4444' }}>● SELL</span>{' '}
              <span style={{ color: '#eab308' }}>● HOLD</span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e303a" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#6b7280', fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={40}
                />
                <YAxis
                  tick={{ fill: '#6b7280', fontSize: 11 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v: number) => `$${v.toFixed(0)}`}
                />
                <Tooltip
                  contentStyle={{ background: '#1e1f27', border: '1px solid #2e303a' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Close Price']}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#4dabf7"
                  dot={(props) => {
                    const { cx, cy, payload } = props as { cx: number; cy: number; payload: SignalPayload }
                    const color = SIGNAL_COLORS[payload?.signal] ?? '#888'
                    return (
                      <circle
                        key={`dot-${payload?.date}`}
                        cx={cx}
                        cy={cy}
                        r={5}
                        fill={color}
                        stroke="#111"
                        strokeWidth={1}
                      />
                    )
                  }}
                  strokeWidth={2}
                  name="price"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Row 3: Feature importance */}
          <div
            style={{
              background: '#1e1f27',
              border: '1px solid #2e303a',
              borderRadius: 10,
              padding: '20px 24px',
            }}
          >
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>
              Feature Importance (XGBoost)
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={topFeatures} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2e303a" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="feature"
                  tick={{ fill: '#9ca3af', fontSize: 12 }}
                  width={110}
                />
                <Tooltip
                  contentStyle={{ background: '#1e1f27', border: '1px solid #2e303a' }}
                  labelStyle={{ color: '#f3f4f6' }}
                  formatter={(v: number) => [v.toFixed(4), 'Importance']}
                />
                <Bar dataKey="importance" radius={[0, 4, 4, 0]}>
                  {topFeatures.map((_, i) => (
                    <Cell
                      key={i}
                      fill={`hsl(${200 + i * 15}, 70%, ${60 - i * 4}%)`}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}

export default SignalClassifier
