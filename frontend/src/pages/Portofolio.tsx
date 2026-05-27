import React, { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CButton, CFormInput, CSpinner, CAlert } from '@coreui/react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { portfolioApi, alpacaApi, stocksApi, SEED_SYMBOLS } from '../services/api'
import type {
  PortfolioAllocationResponse,
  AlpacaAccount,
  AlpacaPosition,
  AlpacaHistory,
  AlpacaSeedResult,
  Sp500Sectors,
  RegimeName,
} from '../services/api'

// ── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:       '#0a0e1a',
  card:     '#0f1623',
  border:   '#1e2433',
  text:     '#e2e8f0',
  muted:    '#475569',
  dimmed:   '#334155',
  bull:     '#10b981',
  bear:     '#ef4444',
  neutral:  '#eab308',
  blue:     '#4dabf7',
  mono:     'monospace',
}

const REGIME_COLOR: Record<RegimeName, string> = {
  bull: C.bull, bear: C.bear, sideways: C.neutral,
}
const REGIME_LABEL: Record<RegimeName, string> = {
  bull: '↑ Bull', bear: '↓ Bear', sideways: '→ Sideways',
}

const BAR_PALETTE = [C.blue, '#51cf66', '#fcc419', '#f783ac', '#74c0fc',
                     '#94d82d', '#ff922b', '#e599f7', '#a9e34b', '#748ffc']

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (v: number) =>
  v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })

const fmtPct = (v: number, showSign = true) => {
  const pct = (v * 100).toFixed(2)
  return showSign && v >= 0 ? `+${pct}%` : `${pct}%`
}

const fmtK = (v: number) =>
  Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : fmt$(v)

// ── Sub-components ────────────────────────────────────────────────────────────

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
    {children}
  </div>
)

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{
    fontSize: 10, fontWeight: 700, letterSpacing: 2,
    color: C.muted, textTransform: 'uppercase' as const, marginBottom: 14,
  }}>
    {children}
  </div>
)

// ── Account header strip ──────────────────────────────────────────────────────

const AccountHeader: React.FC<{
  account: AlpacaAccount | undefined
  isLoading: boolean
  isPaper: boolean
}> = ({ account, isLoading, isPaper }) => {
  if (isLoading) {
    return (
      <div style={{
        background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '14px 24px', marginBottom: 20, display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <CSpinner size="sm" style={{ color: C.blue }} />
        <span style={{ color: C.muted, fontSize: 13 }}>Loading account…</span>
      </div>
    )
  }
  if (!account) return null

  const plPositive = account.day_pl >= 0
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
      padding: '14px 24px', marginBottom: 20,
      display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' as const,
    }}>
      <div>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 2 }}>Equity</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: C.mono }}>{fmt$(account.equity)}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 2 }}>Today</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: plPositive ? C.bull : C.bear, fontFamily: C.mono }}>
          {plPositive ? '+' : ''}{fmt$(account.day_pl)}{' '}
          <span style={{ fontSize: 14 }}>({fmtPct(account.day_plpc)})</span>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: C.muted, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 2 }}>Buying Power</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: C.text, fontFamily: C.mono }}>{fmtK(account.buying_power)}</div>
      </div>
      <div style={{ marginLeft: 'auto' }}>
        {isPaper && (
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 1,
            color: C.neutral, background: 'rgba(234,179,8,0.1)',
            border: `1px solid rgba(234,179,8,0.3)`, borderRadius: 4,
            padding: '3px 10px', textTransform: 'uppercase' as const,
          }}>
            PAPER TRADING
          </span>
        )}
      </div>
    </div>
  )
}

// ── Equity chart ──────────────────────────────────────────────────────────────

const EquityChart: React.FC<{ history: AlpacaHistory }> = ({ history }) => {
  const data = history.timestamps
    .map((ts, i) => ({ date: ts, equity: history.equity[i] }))
    .filter(d => d.equity !== null) as { date: string; equity: number }[]

  if (data.length === 0) return (
    <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>
      No history available
    </div>
  )

  const isUp = data[data.length - 1].equity >= data[0].equity
  const color = isUp ? C.bull : C.bear

  return (
    <ResponsiveContainer width="100%" height={140}>
      <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="date" tick={{ fill: C.dimmed, fontSize: 10 }} interval="preserveStartEnd" minTickGap={60} />
        <YAxis tick={{ fill: C.dimmed, fontSize: 10 }} tickFormatter={v => `$${(Number(v) / 1000).toFixed(0)}k`} width={44} />
        <Tooltip
          contentStyle={{ background: C.card, border: `1px solid ${C.border}` }}
          labelStyle={{ color: C.muted, fontSize: 11 }}
          formatter={(v) => [fmt$(Number(v)), 'Equity']}
        />
        <Area type="monotone" dataKey="equity" stroke={color} strokeWidth={2} fill="url(#equityGrad)" dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Positions table ───────────────────────────────────────────────────────────

const PositionsTable: React.FC<{
  positions: AlpacaPosition[]
  equity: number
  gnnWeights: Record<string, number>
  hasGnn: boolean
}> = ({ positions, equity, gnnWeights, hasGnn }) => {
  if (positions.length === 0) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center' as const, color: C.muted, fontSize: 13 }}>
        No open positions
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' as const }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {['Symbol', 'Qty', 'Price', 'Value', 'P&L', 'Weight', ...(hasGnn ? ['AI Wgt', 'Action'] : [])].map(h => (
              <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Symbol' ? 'left' : 'right' as const, color: C.muted, fontWeight: 500, whiteSpace: 'nowrap' as const }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(p => {
            const weight = equity > 0 ? p.market_value / equity : 0
            const gnnW = gnnWeights[p.symbol] ?? null
            const delta = gnnW !== null ? gnnW - weight : null
            const plPos = p.unrealized_pl >= 0

            return (
              <tr key={p.symbol} style={{ borderBottom: `1px solid ${C.border}22` }}>
                <td style={{ padding: '8px 10px', fontWeight: 700, color: C.text }}>{p.symbol}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: C.muted, fontFamily: C.mono }}>{p.qty}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: C.muted, fontFamily: C.mono }}>{fmt$(p.current_price)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontFamily: C.mono }}>{fmt$(p.market_value)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontFamily: C.mono }}>
                  <span style={{ color: plPos ? C.bull : C.bear }}>
                    {plPos ? '+' : ''}{fmt$(p.unrealized_pl)}{' '}
                    <span style={{ fontSize: 11 }}>({fmtPct(p.unrealized_plpc)})</span>
                  </span>
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right' as const, color: C.muted, fontFamily: C.mono }}>
                  {(weight * 100).toFixed(1)}%
                </td>
                {hasGnn && (
                  <>
                    <td style={{ padding: '8px 10px', textAlign: 'right' as const, fontFamily: C.mono }}>
                      {gnnW !== null
                        ? <span style={{ color: C.blue }}>{(gnnW * 100).toFixed(1)}%</span>
                        : <span style={{ color: C.dimmed }}>—</span>}
                    </td>
                    <td style={{ padding: '8px 10px', textAlign: 'right' as const }}>
                      {delta !== null && (
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          color: Math.abs(delta) < 0.03 ? C.muted : delta > 0 ? C.bull : C.bear,
                          background: Math.abs(delta) < 0.03
                            ? 'rgba(255,255,255,0.05)'
                            : delta > 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                        }}>
                          {Math.abs(delta) < 0.03 ? 'HOLD'
                            : delta > 0 ? `↑ +${(delta * 100).toFixed(1)}%`
                            : `↓ ${(delta * 100).toFixed(1)}%`}
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Connect Alpaca card ───────────────────────────────────────────────────────

const AlpacaConnectCard: React.FC = () => (
  <Card style={{ padding: '32px 28px', height: '100%' }}>
    <div style={{ fontSize: 28, marginBottom: 12 }}>🔌</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 8 }}>Connect Alpaca</div>
    <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>
      Add your Alpaca API keys to <code style={{ color: C.blue, background: 'rgba(77,171,247,0.1)', padding: '1px 6px', borderRadius: 4 }}>.env</code> to see live positions, equity curve, and AI-vs-actual weight comparisons.
    </p>
    <div style={{
      background: '#0a0e1a', border: `1px solid ${C.border}`, borderRadius: 8,
      padding: '12px 16px', fontFamily: C.mono, fontSize: 12, color: '#94a3b8', lineHeight: 1.8,
    }}>
      <div><span style={{ color: C.muted }}># backend/.env</span></div>
      <div><span style={{ color: C.bull }}>ALPACA_API_KEY</span>=your_key_here</div>
      <div><span style={{ color: C.bull }}>ALPACA_SECRET_KEY</span>=your_secret_here</div>
      <div><span style={{ color: C.bull }}>ALPACA_PAPER</span>=true</div>
    </div>
    <p style={{ color: C.dimmed, fontSize: 12, marginTop: 14 }}>
      Get free paper-trading keys at alpaca.markets — no approval required.
    </p>
  </Card>
)

// ── Seed result card ──────────────────────────────────────────────────────────

const SeedResultCard: React.FC<{ result: AlpacaSeedResult }> = ({ result }) => (
  <Card style={{ padding: '18px 20px', marginBottom: 4 }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const }}>
        Seed Orders Placed
      </div>
      <span style={{
        fontSize: 13, fontWeight: 700, fontFamily: C.mono,
        color: C.bull,
      }}>
        {fmt$(result.total_deployed)} deployed
      </span>
    </div>
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
          {['Symbol', 'Notional', 'Status'].map(h => (
            <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Symbol' ? 'left' : 'right' as const, color: C.muted, fontWeight: 500 }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.orders.map(o => (
          <tr key={o.symbol} style={{ borderBottom: `1px solid ${C.border}22` }}>
            <td style={{ padding: '6px 8px', fontWeight: 700, color: C.text }}>{o.symbol}</td>
            <td style={{ padding: '6px 8px', textAlign: 'right' as const, fontFamily: C.mono, color: C.muted }}>{fmt$(o.notional)}</td>
            <td style={{ padding: '6px 8px', textAlign: 'right' as const }}>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 3,
                color: C.bull, background: 'rgba(16,185,129,0.1)',
              }}>
                {o.status.replace('OrderStatus.', '')}
              </span>
            </td>
          </tr>
        ))}
        {result.errors.map(e => (
          <tr key={e.symbol} style={{ borderBottom: `1px solid ${C.border}22` }}>
            <td style={{ padding: '6px 8px', fontWeight: 700, color: C.text }}>{e.symbol}</td>
            <td colSpan={2} style={{ padding: '6px 8px', textAlign: 'right' as const, color: C.bear, fontSize: 11 }}>
              {e.error}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p style={{ fontSize: 11, color: C.muted, marginTop: 10, marginBottom: 0 }}>
      DAY orders — execute at next market open if placed after hours. Refresh positions in ~30 s.
    </p>
  </Card>
)

// ── Sector picker ─────────────────────────────────────────────────────────────

const SECTOR_SHORT: Record<string, string> = {
  'Information Technology': 'Tech',
  'Health Care': 'Healthcare',
  'Communication Services': 'Comms',
  'Consumer Discretionary': 'Discretionary',
  'Consumer Staples': 'Staples',
  'Financials': 'Finance',
  'Industrials': 'Industrials',
  'Energy': 'Energy',
  'Materials': 'Materials',
  'Real Estate': 'Real Estate',
  'Utilities': 'Utilities',
}

const SectorPicker: React.FC<{
  sectors: Sp500Sectors
  selected: string[]   // extra tickers added by the user
  locked: string[]     // Alpaca-held tickers — shown but not toggleable
  onToggle: (ticker: string) => void
}> = ({ sectors, selected, locked, onToggle }) => {
  const sectorNames = Object.keys(sectors)
  const [activeSector, setActiveSector] = useState(sectorNames[0] ?? '')

  const stocks = sectors[activeSector] ?? []
  const selectedSet = new Set(selected)
  const lockedSet = new Set(locked)

  return (
    <div>
      {/* Summary row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: C.muted }}>
          {locked.length > 0 && (
            <span style={{ color: C.bull }}>{locked.length} held</span>
          )}
          {locked.length > 0 && selected.length > 0 && (
            <span style={{ color: C.dimmed }}> · </span>
          )}
          {selected.length > 0 && (
            <span style={{ color: C.blue }}>{selected.length} added to universe</span>
          )}
          {locked.length === 0 && selected.length === 0 && (
            <span>Pick stocks from sectors below</span>
          )}
        </span>
        {selected.length > 0 && (
          <button
            onClick={() => selected.forEach(s => onToggle(s))}
            style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 11, padding: 0 }}
          >
            Clear added
          </button>
        )}
      </div>

      {/* Sector tabs */}
      <div style={{ display: 'flex', gap: 4, overflowX: 'auto' as const, marginBottom: 8, paddingBottom: 2 }}>
        {sectorNames.map(s => (
          <button
            key={s}
            onClick={() => setActiveSector(s)}
            style={{
              padding: '3px 9px',
              borderRadius: 20,
              border: `1px solid ${s === activeSector ? C.blue : C.border}`,
              background: s === activeSector ? 'rgba(77,171,247,0.1)' : 'transparent',
              color: s === activeSector ? C.blue : C.muted,
              fontSize: 11,
              fontWeight: s === activeSector ? 600 : 400,
              cursor: 'pointer',
              whiteSpace: 'nowrap' as const,
              flexShrink: 0,
            }}
          >
            {SECTOR_SHORT[s] ?? s}
          </button>
        ))}
      </div>

      {/* Stock chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 5, maxHeight: 130, overflowY: 'auto' as const }}>
        {stocks.map(({ ticker, name }) => {
          const isLocked = lockedSet.has(ticker)
          const isSelected = selectedSet.has(ticker)
          const active = isLocked || isSelected
          return (
            <button
              key={ticker}
              onClick={() => { if (!isLocked) onToggle(ticker) }}
              title={name}
              style={{
                padding: '3px 8px',
                borderRadius: 12,
                border: `1px solid ${isLocked ? `${C.bull}55` : isSelected ? `${C.blue}66` : C.border}`,
                background: isLocked ? 'rgba(16,185,129,0.08)' : isSelected ? 'rgba(77,171,247,0.1)' : 'transparent',
                color: isLocked ? C.bull : isSelected ? C.blue : C.dimmed,
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                fontFamily: C.mono,
                cursor: isLocked ? 'default' : 'pointer',
              }}
            >
              {ticker}{isLocked ? ' ●' : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Symbol chip input ─────────────────────────────────────────────────────────

const SymbolChips: React.FC<{
  symbols: string[]
  onAdd: (s: string) => void
  onRemove: (s: string) => void
}> = ({ symbols, onAdd, onRemove }) => {
  const [draft, setDraft] = useState('')
  const tryAdd = () => {
    const s = draft.trim().toUpperCase()
    if (s && !symbols.includes(s)) { onAdd(s); setDraft('') }
  }
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, minHeight: 32, marginBottom: 10 }}>
        {symbols.map(s => (
          <span key={s} style={{
            padding: '3px 10px', borderRadius: 20,
            background: 'rgba(77,171,247,0.1)', border: `1px solid ${C.blue}55`,
            color: C.blue, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5,
          }}>
            {s}
            <button onClick={() => onRemove(s)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', padding: 0, lineHeight: 1, fontSize: 14 }}>×</button>
          </span>
        ))}
        {symbols.length === 0 && <span style={{ color: C.dimmed, fontSize: 12, alignSelf: 'center' }}>Add tickers below…</span>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <CFormInput
          placeholder="Ticker (e.g. AAPL)"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && tryAdd()}
          style={{ background: '#111827', border: `1px solid ${C.border}`, color: C.text, maxWidth: 160, fontSize: 13 }}
        />
        <CButton size="sm" color="secondary" onClick={tryAdd} disabled={!draft.trim()}>Add</CButton>
      </div>
    </div>
  )
}

// ── GNN results panel ─────────────────────────────────────────────────────────

const GNNResults: React.FC<{ result: PortfolioAllocationResponse }> = ({ result }) => {
  const regime = result.regime_name
  const weightsData = result.symbols.map((sym, i) => ({
    symbol: sym,
    weight: +(result.weights[i] * 100).toFixed(2),
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, marginTop: 16 }}>
      {/* Regime badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          background: `rgba(${regime === 'bull' ? '16,185,129' : regime === 'bear' ? '239,68,68' : '234,179,8'}, 0.12)`,
          border: `1px solid ${REGIME_COLOR[regime]}44`,
          color: REGIME_COLOR[regime],
          padding: '5px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
        }}>
          {REGIME_LABEL[regime]}
        </span>
        <span style={{ color: C.dimmed, fontSize: 11 }}>
          {new Date(result.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {/* Weights chart */}
      <Card style={{ padding: '16px 20px' }}>
        <SectionLabel>Recommended Weights</SectionLabel>
        <ResponsiveContainer width="100%" height={Math.max(160, weightsData.length * 32)}>
          <BarChart data={weightsData} layout="vertical" margin={{ left: 4, right: 24, top: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
            <XAxis type="number" tick={{ fill: C.dimmed, fontSize: 11 }} tickFormatter={v => `${v}%`} domain={[0, 'dataMax']} />
            <YAxis type="category" dataKey="symbol" tick={{ fill: C.text, fontSize: 12 }} width={48} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const { symbol, weight } = payload[0].payload as { symbol: string; weight: number }
                return (
                  <div style={{
                    background: 'rgba(15,22,35,0.92)',
                    border: `1px solid ${C.border}`,
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 12,
                    color: C.text,
                    lineHeight: 1.6,
                    pointerEvents: 'none',
                  }}>
                    <span style={{ fontWeight: 600 }}>{symbol}</span>
                    <span style={{ color: C.text, marginLeft: 8 }}>{weight.toFixed(2)}%</span>
                  </div>
                )
              }}
            />
            <Bar dataKey="weight" radius={[0, 4, 4, 0]}>
              {weightsData.map((_, i) => <Cell key={i} fill={BAR_PALETTE[i % BAR_PALETTE.length]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* LSTM forecasts */}
      <Card style={{ padding: '16px 20px' }}>
        <SectionLabel>LSTM Forecasts</SectionLabel>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              {['Symbol', 'μ Return', 'Uncertainty', 'Conviction'].map(h => (
                <th key={h} style={{ padding: '4px 8px', textAlign: h === 'Symbol' ? 'left' : 'right' as const, color: C.muted, fontWeight: 500 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.symbols.map(sym => {
              const fc = result.lstm_forecasts[sym]
              const pos = fc.mu >= 0
              const conviction = fc.uncertainty < 0.008 ? 'HIGH' : fc.uncertainty < 0.015 ? 'MED' : 'LOW'
              const cvColor = conviction === 'HIGH' ? C.bull : conviction === 'MED' ? C.neutral : C.bear
              return (
                <tr key={sym} style={{ borderBottom: `1px solid ${C.border}22` }}>
                  <td style={{ padding: '6px 8px', fontWeight: 600, color: C.text }}>{sym}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' as const, fontFamily: C.mono, color: pos ? C.bull : C.bear }}>
                    {pos ? '+' : ''}{(fc.mu * 100).toFixed(4)}%
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' as const, fontFamily: C.mono, color: fc.uncertainty > 0.015 ? C.bear : C.muted }}>
                    ±{(fc.uncertainty * 100).toFixed(4)}%
                  </td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' as const }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
                      color: cvColor, background: `${cvColor}18`,
                    }}>{conviction}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p style={{ fontSize: 11, color: C.dimmed, marginTop: 8 }}>
          LOW conviction (uncertainty &gt; 0.015%) → skip-trade threshold
        </p>
      </Card>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const Portofolio: React.FC = () => {
  // Extra symbols added via the sector picker (beyond Alpaca positions)
  const [extraSymbols, setExtraSymbols] = useState<string[]>([])
  const queryClient = useQueryClient()

  // ── Alpaca queries ──
  const statusQ = useQuery({ queryKey: ['alpaca-status'], queryFn: alpacaApi.getStatus, retry: false })
  const isConnected = statusQ.data?.configured ?? false

  const accountQ = useQuery({
    queryKey: ['alpaca-account'],
    queryFn: alpacaApi.getAccount,
    enabled: isConnected,
    refetchInterval: 30_000,
  })
  const positionsQ = useQuery({
    queryKey: ['alpaca-positions'],
    queryFn: alpacaApi.getPositions,
    enabled: isConnected,
    refetchInterval: 30_000,
  })
  const historyQ = useQuery({
    queryKey: ['alpaca-history'],
    queryFn: () => alpacaApi.getHistory('1M'),
    enabled: isConnected,
    refetchInterval: 300_000,
  })
  const sectorsQ = useQuery({
    queryKey: ['sp500-sectors'],
    queryFn: stocksApi.getSp500Sectors,
    staleTime: 86_400_000, // 24 h — static data
  })

  // ── Derive active symbol list before mutations so closures capture current values ──
  const positions = positionsQ.data ?? []
  const equity = accountQ.data?.equity ?? 0
  const hasPositions = positions.length > 0

  // Alpaca symbols are the base; sector extras extend the optimizer universe
  const alpacaSymbols = positions.map(p => p.symbol)
  const activeSymbols = isConnected && hasPositions
    ? [...new Set([...alpacaSymbols, ...extraSymbols])]
    : extraSymbols
  const usingAlpaca = isConnected && hasPositions

  // ── Seed ──
  const [seedMode, setSeedMode] = useState<'equal' | 'ai'>('equal')
  const [aiSeedWeights, setAiSeedWeights] = useState<{ symbols: string[]; weights: number[] } | null>(null)

  const fetchAiWeightsMut = useMutation({
    mutationFn: () => portfolioApi.optimize(SEED_SYMBOLS),
    onSuccess: (data) => setAiSeedWeights({ symbols: data.symbols, weights: data.weights }),
  })

  const seedMut = useMutation({
    mutationFn: () => {
      if (seedMode === 'ai' && aiSeedWeights) {
        return alpacaApi.seed(aiSeedWeights.symbols, 0.9, aiSeedWeights.weights)
      }
      return alpacaApi.seed()
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['alpaca-positions'] })
      void queryClient.invalidateQueries({ queryKey: ['alpaca-account'] })
    },
  })

  // ── GNN mutations ──
  const optimizeMut = useMutation({ mutationFn: () => portfolioApi.optimize(activeSymbols) })
  const trainMut = useMutation({ mutationFn: () => portfolioApi.startTraining(activeSymbols, 10) })
  const trainStatusQ = useQuery({
    queryKey: ['training-status'],
    queryFn: portfolioApi.getTrainingStatus,
    refetchInterval: q => q.state.data?.running ? 5000 : false,
    enabled: trainMut.isSuccess,
  })

  const result = optimizeMut.data

  // Current weights from Alpaca positions
  const currentWeights: Record<string, number> = {}
  positions.forEach(p => { currentWeights[p.symbol] = equity > 0 ? p.market_value / equity : 0 })

  // GNN recommended weights
  const gnnWeights: Record<string, number> = {}
  if (result) result.symbols.forEach((sym, i) => { gnnWeights[sym] = result.weights[i] })

  return (
    <div style={{ background: C.bg, minHeight: '100%', borderRadius: 12, padding: 28, maxWidth: 1280, marginLeft: 'auto', marginRight: 'auto', overflow: 'hidden' }}>

      {/* ── Page title ── */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.5 }}>
          Portfolio
        </h1>
        <p style={{ color: C.muted, fontSize: 13, margin: '4px 0 0' }}>
          Alpaca positions · GNN allocation optimizer · LSTM forecasts
        </p>
      </div>

      {/* ── Alpaca account header ── */}
      {isConnected && (
        <AccountHeader
          account={accountQ.data}
          isLoading={accountQ.isLoading}
          isPaper={statusQ.data?.paper ?? true}
        />
      )}

      {/* ── Main grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '65fr 35fr', gap: 20, minWidth: 0 }}>

        {/* ── LEFT: Holdings ── */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 0 }}>
          {isConnected ? (
            <>
              {/* Equity curve */}
              <Card style={{ padding: '18px 20px' }}>
                <SectionLabel>Portfolio Equity — 1 Month</SectionLabel>
                {historyQ.isLoading
                  ? <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><CSpinner size="sm" /></div>
                  : historyQ.data
                    ? <EquityChart history={historyQ.data} />
                    : <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted, fontSize: 13 }}>No data</div>
                }
              </Card>

              {/* Seed result */}
              {seedMut.data && <SeedResultCard result={seedMut.data} />}
              {seedMut.isError && (
                <CAlert color="danger" style={{ fontSize: 12 }}>
                  Seed failed: {(seedMut.error as Error).message}
                </CAlert>
              )}

              {/* Positions (or seed CTA when empty) */}
              {!hasPositions && !positionsQ.isLoading && !seedMut.data ? (
                <Card style={{ padding: '28px 24px' }}>
                  {/* Header */}
                  <div style={{ textAlign: 'center' as const, marginBottom: 20 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>🌱</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>
                      Paper account is empty
                    </div>
                    <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, maxWidth: 380, margin: '0 auto' }}>
                      Seed it with a diversified 10-stock portfolio across Tech, Finance, Healthcare, and Energy.
                    </p>
                  </div>

                  {/* Mode toggle */}
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                    <div style={{
                      display: 'inline-flex', background: C.bg,
                      border: `1px solid ${C.border}`, borderRadius: 8, padding: 3,
                    }}>
                      {(['equal', 'ai'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => { setSeedMode(mode); if (mode === 'ai' && !aiSeedWeights) fetchAiWeightsMut.mutate() }}
                          style={{
                            padding: '6px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, transition: 'all 0.15s',
                            background: seedMode === mode ? C.blue : 'transparent',
                            color: seedMode === mode ? '#0a0e1a' : C.muted,
                          }}
                        >
                          {mode === 'equal' ? 'Equal Weight' : 'AI Weighted'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Weight preview */}
                  {seedMode === 'equal' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6, justifyContent: 'center', marginBottom: 20 }}>
                      {SEED_SYMBOLS.map(s => (
                        <span key={s} style={{
                          padding: '3px 10px', borderRadius: 20, fontSize: 12,
                          background: 'rgba(77,171,247,0.08)', border: `1px solid ${C.blue}44`, color: C.blue,
                        }}>{s} 10%</span>
                      ))}
                    </div>
                  )}
                  {seedMode === 'ai' && (
                    <div style={{ marginBottom: 20, maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>
                      {fetchAiWeightsMut.isPending && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.muted, fontSize: 13, padding: '12px 0' }}>
                          <CSpinner size="sm" /> Fetching AI weights…
                        </div>
                      )}
                      {fetchAiWeightsMut.isError && (
                        <p style={{ textAlign: 'center' as const, color: C.bear, fontSize: 12 }}>
                          Could not fetch AI weights — train the model first.
                        </p>
                      )}
                      {aiSeedWeights && aiSeedWeights.symbols.map((sym, i) => {
                        const w = aiSeedWeights.weights[i] * 100
                        const color = BAR_PALETTE[i % BAR_PALETTE.length]
                        return (
                          <div key={sym} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                            <span style={{ width: 44, fontSize: 11, fontWeight: 700, color: C.text, textAlign: 'right' as const }}>{sym}</span>
                            <div style={{ flex: 1, background: C.bg, borderRadius: 3, height: 10, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(w, 100)}%`, height: '100%', background: color, borderRadius: 3 }} />
                            </div>
                            <span style={{ width: 40, fontSize: 11, fontFamily: C.mono, color: C.muted }}>{w.toFixed(1)}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Action */}
                  <div style={{ textAlign: 'center' as const }}>
                    <CButton
                      color="primary"
                      onClick={() => seedMut.mutate()}
                      disabled={seedMut.isPending || (seedMode === 'ai' && !aiSeedWeights)}
                      style={{ minWidth: 220 }}
                    >
                      {seedMut.isPending
                        ? <><CSpinner size="sm" className="me-2" />Placing orders…</>
                        : seedMode === 'ai' ? '🤖 Seed with AI Weights' : '🌱 Seed Paper Account'}
                    </CButton>
                    <p style={{ fontSize: 11, color: C.dimmed, marginTop: 10, marginBottom: 0 }}>
                      {seedMode === 'equal'
                        ? '90% of cash · equal weight · DAY market orders'
                        : '90% of cash · GNN-optimised weights · DAY market orders'}
                    </p>
                  </div>
                </Card>
              ) : (
                <Card style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const }}>
                      Open Positions
                    </div>
                    <div />
                  </div>
                  {positionsQ.isLoading
                    ? <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><CSpinner size="sm" /></div>
                    : <PositionsTable
                        positions={positions}
                        equity={equity}
                        gnnWeights={gnnWeights}
                        hasGnn={!!result && result.symbols.some(s => currentWeights[s] !== undefined)}
                      />
                  }
                </Card>
              )}
            </>
          ) : (
            <AlpacaConnectCard />
          )}
        </div>

        {/* ── RIGHT: GNN Optimizer ── */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16, minWidth: 0 }}>
          <Card style={{ padding: '18px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <SectionLabel>GNN Optimizer</SectionLabel>
              {usingAlpaca && (
                <span style={{ fontSize: 11, color: C.bull }}>
                  ↳ using Alpaca holdings
                </span>
              )}
            </div>

            {sectorsQ.data ? (
              <SectorPicker
                sectors={sectorsQ.data}
                selected={extraSymbols}
                locked={usingAlpaca ? alpacaSymbols : []}
                onToggle={ticker =>
                  setExtraSymbols(prev =>
                    prev.includes(ticker) ? prev.filter(s => s !== ticker) : [...prev, ticker]
                  )
                }
              />
            ) : sectorsQ.isLoading ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', color: C.muted, fontSize: 13 }}>
                <CSpinner size="sm" /> Loading S&amp;P 500 universe…
              </div>
            ) : (
              /* Fallback: manual input if sectors failed */
              <SymbolChips
                symbols={extraSymbols}
                onAdd={s => setExtraSymbols(prev => [...prev, s])}
                onRemove={s => setExtraSymbols(prev => prev.filter(x => x !== s))}
              />
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' as const }}>
              <CButton
                color="primary"
                onClick={() => optimizeMut.mutate()}
                disabled={optimizeMut.isPending || activeSymbols.length < 2}
              >
                {optimizeMut.isPending ? <><CSpinner size="sm" className="me-2" />Running…</> : 'Optimize Portfolio'}
              </CButton>
              <CButton
                color="secondary"
                variant="outline"
                onClick={() => trainMut.mutate()}
                disabled={trainMut.isPending || trainStatusQ.data?.running || activeSymbols.length < 2}
                style={{ fontSize: 13 }}
              >
                {trainStatusQ.data?.running ? <><CSpinner size="sm" className="me-2" />Training…</> : 'Train Models'}
              </CButton>
            </div>

            {optimizeMut.isError && (
              <CAlert color="danger" className="mt-3" style={{ fontSize: 12 }}>
                {(optimizeMut.error as Error).message}
              </CAlert>
            )}
            {trainStatusQ.data?.running && (
              <CAlert color="info" className="mt-3 d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
                <CSpinner size="sm" />
                Walk-forward training in progress — running in the background
              </CAlert>
            )}
            {trainStatusQ.data?.last_result && !trainStatusQ.data.running && (
              <CAlert color="success" className="mt-3" style={{ fontSize: 12 }}>
                Training complete — {trainStatusQ.data.last_result.folds_completed} folds
              </CAlert>
            )}
          </Card>

          {result && <GNNResults result={result} />}
        </div>
      </div>
    </div>
  )
}

export default Portofolio
