import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CSpinner, CAlert } from '@coreui/react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { hmmApi, mlflowApi, SEED_SYMBOLS } from '../services/api'
import type { MLflowRun } from '../services/api'

const C = {
  bg: '#0a0e1a', card: '#0f1623', border: '#1e2433',
  text: '#e2e8f0', muted: '#475569', dimmed: '#334155',
  bull: '#10b981', bear: '#ef4444', neutral: '#eab308',
  blue: '#4dabf7', mono: 'monospace',
}

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, ...style }}>
    {children}
  </div>
)

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: C.muted, textTransform: 'uppercase' as const, marginBottom: 14 }}>
    {children}
  </div>
)

const statusColor = (status: string) =>
  status === 'FINISHED' ? C.bull : status === 'RUNNING' ? C.neutral : C.bear

const Models: React.FC = () => {
  const qc = useQueryClient()
  const [selectedRun, setSelectedRun] = useState<MLflowRun | null>(null)
  const [selectedMetric] = useState<'train_loss' | 'val_loss'>('train_loss')

  const hmmQ = useQuery({ queryKey: ['hmm-status'], queryFn: hmmApi.getStatus, refetchInterval: q => q.state.data?.running ? 2000 : false })
  const runsQ = useQuery({ queryKey: ['mlflow-runs'], queryFn: () => mlflowApi.getRuns(30) })

  const trainHistQ = useQuery({
    queryKey: ['mlflow-history', selectedRun?.run_id, selectedMetric],
    queryFn: () => mlflowApi.getRunHistory(selectedRun!.run_id, selectedMetric),
    enabled: !!selectedRun,
  })
  const valHistQ = useQuery({
    queryKey: ['mlflow-history', selectedRun?.run_id, 'val_loss'],
    queryFn: () => mlflowApi.getRunHistory(selectedRun!.run_id, 'val_loss'),
    enabled: !!selectedRun,
  })

  const fitMut = useMutation({
    mutationFn: () => hmmApi.fit(SEED_SYMBOLS),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['hmm-status'] })
    },
  })

  const hmm = hmmQ.data

  const chartData = (() => {
    if (!trainHistQ.data || !valHistQ.data) return []
    const map: Record<number, { fold: number; train_loss?: number; val_loss?: number }> = {}
    trainHistQ.data.forEach(p => { map[p.step] = { fold: p.step, train_loss: p.value } })
    valHistQ.data.forEach(p => {
      if (!map[p.step]) map[p.step] = { fold: p.step }
      map[p.step].val_loss = p.value
    })
    return Object.values(map).sort((a, b) => a.fold - b.fold)
  })()

  return (
    <div style={{ background: C.bg, minHeight: '100%', borderRadius: 12, padding: 28, maxWidth: 1280, margin: '0 auto', overflow: 'hidden' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: -0.5 }}>Models</h1>
        <p style={{ color: C.muted, fontSize: 13, margin: '4px 0 0' }}>HMM regime detector · LSTM forecaster · GNN portfolio optimizer</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, marginBottom: 20, minWidth: 0 }}>

        {/* HMM Status */}
        <Card style={{ padding: '18px 20px' }}>
          <Label>HMM Status</Label>
          {hmmQ.isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.muted, fontSize: 13 }}>
              <CSpinner size="sm" /> Loading...
            </div>
          ) : hmm ? (
            <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' as const }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
                  color: hmm.fitted ? C.bull : C.bear,
                  background: hmm.fitted ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)',
                  border: `1px solid ${hmm.fitted ? C.bull : C.bear}44`,
                }}>
                  {hmm.running ? '⟳ FITTING...' : hmm.fitted ? '✓ FITTED' : '✗ NOT FITTED'}
                </span>
                {hmm.n_features && (
                  <span style={{ fontSize: 11, color: C.blue, background: 'rgba(77,171,247,0.08)', border: `1px solid ${C.blue}33`, padding: '3px 10px', borderRadius: 20 }}>
                    {hmm.n_features} assets
                  </span>
                )}
              </div>

              {hmm.error && (
                <div style={{ fontSize: 11, color: C.bear, background: 'rgba(239,68,68,0.08)', border: `1px solid ${C.bear}33`, borderRadius: 6, padding: '8px 12px' }}>
                  {hmm.error}
                </div>
              )}

              <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>
                Fits a 3-state multivariate Gaussian HMM on daily log-returns.
                Uses the 10 default seed symbols.
              </p>

              <button
                onClick={() => fitMut.mutate()}
                disabled={fitMut.isPending || hmm.running}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: hmm.running || fitMut.isPending ? C.dimmed : C.blue,
                  color: '#fff', fontWeight: 600, fontSize: 13,
                  opacity: hmm.running || fitMut.isPending ? 0.6 : 1,
                }}
              >
                {hmm.running ? <><CSpinner size="sm" className="me-2" />Fitting...</> : hmm.fitted ? 'Refit HMM' : 'Fit HMM'}
              </button>

              {fitMut.isError && (
                <CAlert color="danger" style={{ fontSize: 12, marginBottom: 0 }}>
                  {(fitMut.error as Error).message}
                </CAlert>
              )}
            </div>
          ) : null}
        </Card>

        {/* Info cards */}
        <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12, minWidth: 0 }}>
          {[
            { label: 'HMM', desc: '3-state Gaussian HMM (bull / bear / sideways). Multivariate diagonal covariance, z-score standardised. Hungarian-algorithm label stabilisation between refits.' },
            { label: 'LSTM', desc: 'Regime-conditioned LSTM with one output head per HMM state. Predicts (mu, log sigma) for each asset. Monte-Carlo dropout for uncertainty quantification.' },
            { label: 'GNN', desc: 'Regime-conditioned Graph Neural Network. Nodes = assets, edges = rolling Pearson correlations. Outputs long-only softmax portfolio weights.' },
          ].map(m => (
            <div key={m.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: 'rgba(77,171,247,0.1)', border: `1px solid ${C.blue}33`, padding: '2px 8px', borderRadius: 4, flexShrink: 0, fontFamily: C.mono }}>
                {m.label}
              </span>
              <p style={{ fontSize: 12, color: C.muted, margin: 0, lineHeight: 1.6 }}>{m.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Runs table + chart */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedRun ? '1fr 1fr' : '1fr', gap: 20, minWidth: 0 }}>

        {/* Runs list */}
        <Card style={{ padding: '18px 20px', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
            <Label>Training Runs</Label>
            <button
              onClick={() => void qc.invalidateQueries({ queryKey: ['mlflow-runs'] })}
              style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: 12 }}
            >
              Refresh
            </button>
          </div>
          {runsQ.isLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><CSpinner size="sm" /></div>
          ) : !runsQ.data || runsQ.data.length === 0 ? (
            <div style={{ textAlign: 'center' as const, padding: '32px 0', color: C.muted, fontSize: 13 }}>
              No runs yet - trigger training from the Portfolio page.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' as const }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {['Run', 'Symbols', 'Folds', 'Final Val Loss', 'Started', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left' as const, color: C.muted, fontWeight: 500, whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {runsQ.data.map(run => (
                    <tr
                      key={run.run_id}
                      onClick={() => setSelectedRun(selectedRun?.run_id === run.run_id ? null : run)}
                      style={{
                        borderBottom: `1px solid ${C.border}22`,
                        cursor: 'pointer',
                        background: selectedRun?.run_id === run.run_id ? `${C.blue}11` : 'transparent',
                      }}
                    >
                      <td style={{ padding: '8px 10px', color: C.blue, fontFamily: C.mono, fontSize: 11 }}>
                        {run.run_name || run.run_id.slice(0, 8)}
                      </td>
                      <td style={{ padding: '8px 10px', color: C.muted }}>
                        {run.params.n_assets ? `${run.params.n_assets} assets` : (run.params.symbols?.split(',').length ?? 0) + ' assets'}
                      </td>
                      <td style={{ padding: '8px 10px', color: C.text, fontFamily: C.mono }}>
                        {run.metrics.folds_completed ?? '—'}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: C.mono }}>
                        {run.metrics.val_loss !== undefined
                          ? <span style={{ color: C.neutral }}>{run.metrics.val_loss.toFixed(4)}</span>
                          : <span style={{ color: C.dimmed }}>—</span>}
                      </td>
                      <td style={{ padding: '8px 10px', color: C.muted, whiteSpace: 'nowrap' as const }}>
                        {run.start_time ? new Date(run.start_time).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 3, color: statusColor(run.status), background: `${statusColor(run.status)}18` }}>
                          {run.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Loss chart */}
        {selectedRun && (
          <Card style={{ padding: '18px 20px', minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
              <Label>Fold Losses — {selectedRun.run_name || selectedRun.run_id.slice(0, 8)}</Label>
              <button onClick={() => setSelectedRun(null)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>x</button>
            </div>
            {trainHistQ.isLoading || valHistQ.isLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><CSpinner size="sm" /></div>
            ) : chartData.length === 0 ? (
              <div style={{ textAlign: 'center' as const, padding: 32, color: C.muted, fontSize: 13 }}>No metric history available</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={chartData} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                  <XAxis dataKey="fold" tick={{ fill: C.dimmed, fontSize: 11 }} label={{ value: 'Fold', position: 'insideBottom', fill: C.muted, fontSize: 11 }} />
                  <YAxis tick={{ fill: C.dimmed, fontSize: 11 }} width={48} />
                  <Tooltip
                    contentStyle={{ background: C.card, border: `1px solid ${C.border}` }}
                    labelStyle={{ color: C.muted, fontSize: 11 }}
                    formatter={(v: unknown, name: unknown) => [typeof v === 'number' ? v.toFixed(4) : String(v), String(name ?? '')]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.muted }} />
                  <Line type="monotone" dataKey="train_loss" stroke={C.blue} strokeWidth={2} dot={false} name="Train Loss" />
                  <Line type="monotone" dataKey="val_loss" stroke={C.neutral} strokeWidth={2} dot={false} name="Val Loss" />
                </LineChart>
              </ResponsiveContainer>
            )}
            {selectedRun.params.symbols && (
              <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap' as const, gap: 4 }}>
                {selectedRun.params.symbols.split(',').map(s => (
                  <span key={s} style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'rgba(77,171,247,0.08)', border: `1px solid ${C.blue}33`, color: C.blue, fontFamily: C.mono }}>{s}</span>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}

export default Models
