import React, { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  CButton,
  CFormInput,
  CSpinner,
  CAlert,
  CRow,
  CCol,
} from '@coreui/react'
import { regimeApi } from '../services/api'
import type { RegimeStateResponse, RegimeName } from '../services/api'

// ── Constants ─────────────────────────────────────────────────────────────────

const REGIME_COLOR: Record<RegimeName, string> = {
  bull:     '#10b981',
  bear:     '#ef4444',
  sideways: '#eab308',
}

const REGIME_RGB: Record<RegimeName, string> = {
  bull:     '16, 185, 129',
  bear:     '239, 68, 68',
  sideways: '234, 179, 8',
}

const REGIME_META: Record<RegimeName, {
  emoji: string
  arrow: string
  label: string
  description: string
  detail: string
  tag: string
}> = {
  bull: {
    emoji: '📈',
    arrow: '↑',
    label: 'Bull',
    description: 'Momentum regime',
    detail: 'GNN dense graph · τ = 0.55',
    tag: 'RISK-ON',
  },
  bear: {
    emoji: '📉',
    arrow: '↓',
    label: 'Bear',
    description: 'Defensive regime',
    detail: 'GNN sparse graph · τ = 0.65',
    tag: 'RISK-OFF',
  },
  sideways: {
    emoji: '↔️',
    arrow: '→',
    label: 'Sideways',
    description: 'Mean-reversion regime',
    detail: 'GNN moderate graph · τ = 0.45',
    tag: 'NEUTRAL',
  },
}

const STATE_NAMES: RegimeName[] = ['bull', 'bear', 'sideways']

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNextRegime(
  matrix: number[][],
  currentState: number,
): { regime: RegimeName; prob: number } | null {
  const row = matrix[currentState] ?? []
  let maxProb = -1
  let maxIdx = -1
  row.forEach((prob, i) => {
    if (i !== currentState && prob > maxProb) {
      maxProb = prob
      maxIdx = i
    }
  })
  return maxIdx >= 0 ? { regime: STATE_NAMES[maxIdx], prob: maxProb } : null
}

// ── Sub-components ────────────────────────────────────────────────────────────

const RegimeCard: React.FC<{
  name: RegimeName
  prob: number
  isActive: boolean
}> = ({ name, prob, isActive }) => {
  const color = REGIME_COLOR[name]
  const rgb = REGIME_RGB[name]
  const meta = REGIME_META[name]

  return (
    <div
      style={{
        borderRadius: 14,
        padding: '20px 22px',
        border: isActive ? `1.5px solid ${color}` : '1px solid #1e2433',
        background: isActive ? `rgba(${rgb}, 0.08)` : '#0f1623',
        opacity: isActive ? 1 : 0.38,
        boxShadow: isActive
          ? `0 0 32px rgba(${rgb}, 0.16), 0 0 0 1px rgba(${rgb}, 0.1)`
          : 'none',
        transform: isActive ? 'scale(1.02)' : 'scale(1)',
        transition: 'all 0.35s ease',
        position: 'relative' as const,
      }}
    >
      {isActive && (
        <div
          style={{
            position: 'absolute' as const,
            top: 14,
            right: 14,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 1.5,
            color,
            background: `rgba(${rgb}, 0.15)`,
            padding: '3px 8px',
            borderRadius: 4,
            border: `1px solid rgba(${rgb}, 0.3)`,
          }}
        >
          {meta.tag}
        </div>
      )}

      <div style={{ fontSize: 28, marginBottom: 6, lineHeight: 1 }}>{meta.emoji}</div>

      <div
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: isActive ? color : '#94a3b8',
          letterSpacing: -0.5,
          marginBottom: 2,
        }}
      >
        {meta.arrow} {meta.label}
      </div>

      <div
        style={{
          fontSize: 34,
          fontWeight: 700,
          color: isActive ? color : '#475569',
          fontFamily: 'monospace',
          letterSpacing: -1,
          marginBottom: 10,
        }}
      >
        {(prob * 100).toFixed(1)}%
      </div>

      <div
        style={{
          height: 4,
          borderRadius: 2,
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${prob * 100}%`,
            background: color,
            borderRadius: 2,
            transition: 'width 0.6s ease',
          }}
        />
      </div>

      <div style={{ fontSize: 12, lineHeight: 1.5 }}>
        <div
          style={{
            fontWeight: 600,
            color: isActive ? '#cbd5e1' : '#475569',
            marginBottom: 2,
          }}
        >
          {meta.description}
        </div>
        <div style={{ color: isActive ? '#64748b' : '#334155', fontSize: 11 }}>
          {meta.detail}
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

const Regime: React.FC = () => {
  const [input, setInput] = useState('AAPL,MSFT,GOOGL')

  const mutation = useMutation({
    mutationFn: () => {
      const syms = input.split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      return regimeApi.getState(syms)
    },
  })

  const result: RegimeStateResponse | undefined = mutation.data
  const regime = result?.state_name
  const nextRegime = result
    ? getNextRegime(result.transition_matrix, result.current_state)
    : null

  return (
    <div
      style={{
        padding: '28px',
        background: '#0a0e1a',
        minHeight: '100%',
        borderRadius: 12,
        border: '1px solid #1e2433',
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#f1f5f9',
            margin: 0,
            letterSpacing: -0.5,
          }}
        >
          Market Regime
        </h1>
        <p style={{ color: '#475569', fontSize: 13, margin: '4px 0 0' }}>
          Hidden Markov Model · 3 states: bull · bear · sideways
        </p>
      </div>

      {/* ── Input ── */}
      <CRow className="mb-4 g-3 align-items-center">
        <CCol>
          <CFormInput
            placeholder="Comma-separated symbols, e.g. AAPL,MSFT,GOOGL"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mutation.mutate()}
            style={{
              background: '#111827',
              border: '1px solid #1e2d3d',
              color: '#e2e8f0',
            }}
          />
        </CCol>
        <CCol xs="auto">
          <CButton
            color="primary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !input.trim()}
            style={{ minWidth: 140 }}
          >
            {mutation.isPending ? (
              <><CSpinner size="sm" className="me-2" />Analysing…</>
            ) : (
              'Detect Regime'
            )}
          </CButton>
        </CCol>
      </CRow>

      {mutation.isError && (
        <CAlert color="danger" className="mb-4">
          {(mutation.error as Error).message}
        </CAlert>
      )}

      {/* ── Results ── */}
      {result && regime && (
        <>
          {/* Three regime cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {STATE_NAMES.map((name, idx) => (
              <RegimeCard
                key={name}
                name={name}
                prob={result.state_probs[idx] ?? 0}
                isActive={name === regime}
              />
            ))}
          </div>

          {/* Bottom panels */}
          <CRow className="g-3">
            {/* LEFT: Current regime snapshot */}
            <CCol md={5}>
              <div
                style={{
                  background: '#0f1623',
                  border: '1px solid #1e2433',
                  borderRadius: 12,
                  padding: '20px 24px',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: '#475569',
                    marginBottom: 14,
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Current Regime
                </div>

                {/* Big name + confidence */}
                <div style={{ marginBottom: 20 }}>
                  <span
                    style={{
                      fontSize: 34,
                      fontWeight: 700,
                      color: REGIME_COLOR[regime],
                      letterSpacing: -1,
                    }}
                  >
                    {REGIME_META[regime].arrow} {REGIME_META[regime].label}
                  </span>
                  <span
                    style={{
                      marginLeft: 12,
                      fontSize: 18,
                      fontWeight: 600,
                      color: '#64748b',
                      fontFamily: 'monospace',
                    }}
                  >
                    {(result.state_probs[result.current_state] * 100).toFixed(1)}%
                  </span>
                </div>

                {/* Probability bars */}
                <div
                  style={{ display: 'flex', flexDirection: 'column' as const, gap: 10, marginBottom: 20 }}
                >
                  {STATE_NAMES.map((name, idx) => {
                    const prob = result.state_probs[idx] ?? 0
                    const isCurrentState = name === regime
                    return (
                      <div key={name}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: 4,
                            alignItems: 'center',
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: isCurrentState ? 700 : 400,
                              color: isCurrentState ? REGIME_COLOR[name] : '#64748b',
                            }}
                          >
                            {isCurrentState ? '● ' : '○ '}
                            {name.charAt(0).toUpperCase() + name.slice(1)}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              fontFamily: 'monospace',
                              color: isCurrentState ? REGIME_COLOR[name] : '#475569',
                            }}
                          >
                            {(prob * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div
                          style={{
                            height: 5,
                            borderRadius: 2.5,
                            background: '#1e2433',
                            overflow: 'hidden',
                          }}
                        >
                          <div
                            style={{
                              height: '100%',
                              width: `${prob * 100}%`,
                              background: REGIME_COLOR[name],
                              opacity: isCurrentState ? 1 : 0.35,
                              borderRadius: 2.5,
                              transition: 'width 0.5s ease',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Most likely next regime */}
                {nextRegime && (
                  <div
                    style={{
                      background: `rgba(${REGIME_RGB[nextRegime.regime]}, 0.06)`,
                      border: `1px solid rgba(${REGIME_RGB[nextRegime.regime]}, 0.2)`,
                      borderRadius: 8,
                      padding: '10px 14px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 10,
                          color: '#475569',
                          fontWeight: 600,
                          letterSpacing: 1,
                          textTransform: 'uppercase' as const,
                          marginBottom: 3,
                        }}
                      >
                        Most likely next
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: REGIME_COLOR[nextRegime.regime],
                        }}
                      >
                        {REGIME_META[nextRegime.regime].arrow}{' '}
                        {REGIME_META[nextRegime.regime].label}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        fontFamily: 'monospace',
                        color: REGIME_COLOR[nextRegime.regime],
                      }}
                    >
                      {(nextRegime.prob * 100).toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            </CCol>

            {/* RIGHT: Transition matrix */}
            <CCol md={7}>
              <div
                style={{
                  background: '#0f1623',
                  border: '1px solid #1e2433',
                  borderRadius: 12,
                  padding: '20px 24px',
                  height: '100%',
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 2,
                    color: '#475569',
                    marginBottom: 4,
                    textTransform: 'uppercase' as const,
                  }}
                >
                  Transition Matrix
                </div>
                <div style={{ fontSize: 11, color: '#334155', marginBottom: 16 }}>
                  Row = current state · Column = next state · Diagonal = regime persistence
                </div>

                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'separate' as const,
                    borderSpacing: 4,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ width: 90, paddingBottom: 6 }} />
                      {STATE_NAMES.map(n => (
                        <th
                          key={n}
                          style={{
                            textAlign: 'center' as const,
                            color: REGIME_COLOR[n],
                            fontSize: 12,
                            fontWeight: 600,
                            paddingBottom: 6,
                          }}
                        >
                          → {n.charAt(0).toUpperCase() + n.slice(1)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {STATE_NAMES.map((rowName, ri) => {
                      const isCurrentRow = rowName === regime
                      return (
                        <tr key={rowName}>
                          <td
                            style={{
                              paddingRight: 10,
                              paddingLeft: 6,
                              borderLeft: `3px solid ${
                                isCurrentRow ? REGIME_COLOR[rowName] : 'transparent'
                              }`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 12,
                                fontWeight: isCurrentRow ? 700 : 500,
                                color: isCurrentRow ? REGIME_COLOR[rowName] : '#64748b',
                              }}
                            >
                              {isCurrentRow ? '▶ ' : ''}
                              {rowName.charAt(0).toUpperCase() + rowName.slice(1)}
                            </span>
                          </td>
                          {STATE_NAMES.map((colName, ci) => {
                            const val = result.transition_matrix[ri]?.[ci] ?? 0
                            const rgb = REGIME_RGB[colName]
                            return (
                              <td
                                key={colName}
                                style={{
                                  textAlign: 'center' as const,
                                  padding: '8px 6px',
                                  borderRadius: 7,
                                  background: `rgba(${rgb}, ${val * 0.8 + 0.04})`,
                                  fontSize: 13,
                                  fontWeight: ri === ci ? 700 : 400,
                                  color: val > 0.4 ? '#fff' : '#64748b',
                                  fontFamily: 'monospace',
                                  opacity: isCurrentRow ? 1 : 0.6,
                                  border:
                                    isCurrentRow && ri === ci
                                      ? `1.5px solid ${REGIME_COLOR[colName]}55`
                                      : 'none',
                                }}
                              >
                                {(val * 100).toFixed(0)}%
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </CCol>
          </CRow>
        </>
      )}
    </div>
  )
}

export default Regime
