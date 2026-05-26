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
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts'
import { strategyApi, type StrategyResponse } from '../services/api'

// ── Colour palette for strategies ─────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  'Trend Following': '#4dabf7',
  'Mean Reversion': '#c084fc',
  'Momentum': '#10b981',
  'Breakout': '#f59e0b',
  'Defensive': '#6b7280',
}

const REGIME_LABELS: Record<string, { label: string; color: string }> = {
  trending_up: { label: 'Trending Up', color: '#10b981' },
  trending_down: { label: 'Trending Down', color: '#ef4444' },
  volatile: { label: 'Volatile', color: '#f59e0b' },
  sideways: { label: 'Sideways', color: '#9ca3af' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ConditionCardProps {
  label: string
  value: string
  color?: string
}

const ConditionCard: React.FC<ConditionCardProps> = ({ label, value, color = '#f3f4f6' }) => (
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
    <div style={{ color, fontSize: 18, fontWeight: 700 }}>{value}</div>
    <div style={{ color: '#6b7280', fontSize: 12, marginTop: 4 }}>{label}</div>
  </div>
)

interface BacktestTableProps {
  results: StrategyResponse['backtest_results']
  recommended: string
}

const BacktestTable: React.FC<BacktestTableProps> = ({ results, recommended }) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #2e303a' }}>
          {['Strategy', 'Return (%)', 'Sharpe', 'Win Rate (%)', 'Max DD (%)'].map((h) => (
            <th key={h} style={{ padding: '8px 12px', color: '#9ca3af', textAlign: 'left', fontWeight: 600 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {results.map((r) => {
          const isRec = r.strategy === recommended
          const color = STRATEGY_COLORS[r.strategy] ?? '#f3f4f6'
          return (
            <tr
              key={r.strategy}
              style={{
                borderBottom: '1px solid #1a1b22',
                background: isRec ? 'rgba(77,171,247,0.06)' : 'transparent',
              }}
            >
              <td style={{ padding: '10px 12px', color, fontWeight: isRec ? 700 : 400 }}>
                {r.strategy}
                {isRec && (
                  <span
                    style={{
                      marginLeft: 8,
                      background: 'rgba(77,171,247,0.2)',
                      border: '1px solid rgba(77,171,247,0.4)',
                      borderRadius: 10,
                      padding: '1px 8px',
                      fontSize: 10,
                      color: '#4dabf7',
                      fontWeight: 700,
                    }}
                  >
                    RECOMMENDED
                  </span>
                )}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  color: r.total_return >= 0 ? '#10b981' : '#ef4444',
                  fontWeight: 600,
                }}
              >
                {r.total_return >= 0 ? '+' : ''}{r.total_return.toFixed(2)}
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  color: r.sharpe_ratio >= 1 ? '#10b981' : r.sharpe_ratio >= 0 ? '#f3f4f6' : '#ef4444',
                }}
              >
                {r.sharpe_ratio.toFixed(3)}
              </td>
              <td style={{ padding: '10px 12px', color: '#f3f4f6' }}>{r.win_rate.toFixed(1)}</td>
              <td style={{ padding: '10px 12px', color: r.max_drawdown > 10 ? '#ef4444' : '#9ca3af' }}>
                {r.max_drawdown.toFixed(2)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  </div>
)

// ── Main page ─────────────────────────────────────────────────────────────────

const StrategySelector: React.FC = () => {
  const [input, setInput] = useState('')
  const [symbol, setSymbol] = useState('')

  const { data, isLoading, isError, error } = useQuery<StrategyResponse, Error>({
    queryKey: ['strategy', symbol],
    queryFn: () => strategyApi.getStrategy(symbol),
    enabled: symbol.length > 0,
  })

  const handleAnalyze = () => {
    const t = input.trim().toUpperCase()
    if (t) setSymbol(t)
  }

  const radarData = data
    ? data.strategy_scores.map((s) => ({
        subject: s.strategy.split(' ')[0],
        score: parseFloat((s.score * 100).toFixed(1)),
        fullName: s.strategy,
      }))
    : []

  const mc = data?.market_conditions
  const regimeInfo = mc ? (REGIME_LABELS[mc.regime] ?? { label: mc.regime, color: '#9ca3af' }) : null

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1000 }}>
      <h1 style={{ color: '#f3f4f6', marginBottom: 4 }}>Strategy Selector</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>
        Logistic Regression model trained on sliding-window backtests to recommend the optimal
        trading strategy for current market conditions
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
            background: '#c084fc',
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
          Training Logistic Regression on historical windows… (this may take ~20 seconds)
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

      {data && mc && regimeInfo && (
        <>
          {/* Row 1: Recommended strategy card */}
          <div
            style={{
              background: 'rgba(77,171,247,0.08)',
              border: '2px solid rgba(77,171,247,0.35)',
              borderRadius: 12,
              padding: '22px 28px',
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 24,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 4 }}>
                Recommended Strategy for <strong style={{ color: '#c084fc' }}>{data.symbol}</strong>
              </div>
              <div
                style={{
                  color: STRATEGY_COLORS[data.recommended_strategy] ?? '#4dabf7',
                  fontSize: 34,
                  fontWeight: 900,
                }}
              >
                {data.recommended_strategy}
              </div>
            </div>
            <div style={{ color: '#9ca3af', fontSize: 14, maxWidth: 440, lineHeight: 1.6 }}>
              {data.strategy_scores.find((s) => s.strategy === data.recommended_strategy)?.description}
            </div>
          </div>

          {/* Row 2: Market conditions */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 10 }}>Market Conditions</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <ConditionCard
                label="Market Regime"
                value={regimeInfo.label}
                color={regimeInfo.color}
              />
              <ConditionCard
                label="Annualized Volatility"
                value={`${(mc.volatility * 100).toFixed(1)}%`}
                color={mc.volatility > 0.4 ? '#ef4444' : mc.volatility > 0.2 ? '#f59e0b' : '#10b981'}
              />
              <ConditionCard
                label="Trend Strength"
                value={`${(mc.trend_strength * 100).toFixed(2)}%`}
                color={mc.trend_strength > 0.03 ? '#4dabf7' : '#9ca3af'}
              />
              <ConditionCard
                label="20-day Momentum"
                value={`${mc.momentum >= 0 ? '+' : ''}${(mc.momentum * 100).toFixed(2)}%`}
                color={mc.momentum >= 0 ? '#10b981' : '#ef4444'}
              />
            </div>
          </div>

          {/* Row 3: Strategy scores + radar */}
          <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
            {/* Bar chart */}
            <div
              style={{
                background: '#1e1f27',
                border: '1px solid #2e303a',
                borderRadius: 10,
                padding: '20px 24px',
                flex: 2,
                minWidth: 300,
              }}
            >
              <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>
                Strategy Scores (Logistic Regression)
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.strategy_scores}
                  layout="vertical"
                  margin={{ left: 16, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2e303a" horizontal={false} />
                  <XAxis type="number" domain={[0, 1]} tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="strategy"
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e1f27', border: '1px solid #2e303a' }}
                    labelStyle={{ color: '#f3f4f6' }}
                    formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'Score']}
                  />
                  <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                    {data.strategy_scores.map((s) => (
                      <Cell
                        key={s.strategy}
                        fill={STRATEGY_COLORS[s.strategy] ?? '#888'}
                        opacity={s.strategy === data.recommended_strategy ? 1 : 0.55}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Radar chart */}
            <div
              style={{
                background: '#1e1f27',
                border: '1px solid #2e303a',
                borderRadius: 10,
                padding: '20px 24px',
                flex: 1,
                minWidth: 260,
              }}
            >
              <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 16 }}>
                Score Radar
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData}>
                  <PolarGrid stroke="#2e303a" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                  <PolarRadiusAxis
                    angle={30}
                    domain={[0, 100]}
                    tick={{ fill: '#6b7280', fontSize: 9 }}
                  />
                  <Radar
                    name="Score"
                    dataKey="score"
                    stroke="#c084fc"
                    fill="#c084fc"
                    fillOpacity={0.25}
                  />
                  <Tooltip
                    contentStyle={{ background: '#1e1f27', border: '1px solid #2e303a' }}
                    formatter={(v: number) => [`${v.toFixed(1)}%`, 'Score']}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Row 4: Backtest table */}
          <div
            style={{
              background: '#1e1f27',
              border: '1px solid #2e303a',
              borderRadius: 10,
              padding: '20px 24px',
            }}
          >
            <div style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 4 }}>
              Backtest Results (last 90 trading days)
            </div>
            <div style={{ color: '#6b7280', fontSize: 12, marginBottom: 16 }}>
              Simulated performance of each strategy on recent historical data
            </div>
            <BacktestTable results={data.backtest_results} recommended={data.recommended_strategy} />
          </div>
        </>
      )}
    </div>
  )
}

export default StrategySelector
