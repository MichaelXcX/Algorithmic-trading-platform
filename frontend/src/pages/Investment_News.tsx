import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CSpinner } from '@coreui/react'
import '@coreui/coreui/dist/css/coreui.min.css'
import { newsApi, type Article, type NewsSentimentResponse as NewsResponse } from '../services/api'

const SENTIMENT_STYLES = {
  positive: {
    badge: { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' },
    bar: '#10b981',
    label: 'Positive',
  },
  negative: {
    badge: { background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
    bar: '#ef4444',
    label: 'Negative',
  },
  neutral: {
    badge: { background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' },
    bar: '#eab308',
    label: 'Neutral',
  },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

interface SentimentBarProps {
  positive: number
  negative: number
  neutral: number
}

const SentimentBar: React.FC<SentimentBarProps> = ({ positive, negative, neutral }) => (
  <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 }}>
    <div style={{ flex: positive, background: '#10b981' }} title={`Positive ${Math.round(positive * 100)}%`} />
    <div style={{ flex: neutral, background: '#eab308' }} title={`Neutral ${Math.round(neutral * 100)}%`} />
    <div style={{ flex: negative, background: '#ef4444' }} title={`Negative ${Math.round(negative * 100)}%`} />
  </div>
)

interface ArticleCardProps {
  article: Article
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article }) => {
  const style = SENTIMENT_STYLES[article.sentiment]
  const compoundDisplay = article.compound >= 0
    ? `+${article.compound.toFixed(3)}`
    : article.compound.toFixed(3)

  return (
    <div
      style={{
        background: '#1e1f27',
        border: '1px solid #2e303a',
        borderRadius: 10,
        padding: '16px 20px',
        marginBottom: 12,
        display: 'flex',
        gap: 16,
      }}
    >
      {article.urlToImage && (
        <img
          src={article.urlToImage}
          alt=""
          style={{ width: 90, height: 65, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#f3f4f6', fontWeight: 600, fontSize: 15, textDecoration: 'none', lineHeight: 1.4 }}
          >
            {article.title}
          </a>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            <span style={{ ...style.badge, borderRadius: 20, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>
              {style.label}
            </span>
            <span style={{ color: style.badge.color, fontSize: 12, fontWeight: 500 }}>
              {compoundDisplay}
            </span>
          </div>
        </div>

        {article.description && (
          <p style={{ color: '#9ca3af', fontSize: 13, margin: '0 0 10px', lineHeight: 1.5 }}>
            {article.description.length > 160
              ? article.description.slice(0, 160) + '…'
              : article.description}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <SentimentBar
              positive={article.positive}
              negative={article.negative}
              neutral={article.neutral}
            />
          </div>
          <span style={{ color: '#6b7280', fontSize: 12, whiteSpace: 'nowrap' }}>
            {article.source && <>{article.source} &middot; </>}
            {formatDate(article.publishedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: number | string
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color }) => (
  <div
    style={{
      flex: 1,
      background: '#1e1f27',
      border: '1px solid #2e303a',
      borderRadius: 10,
      padding: '14px 18px',
      textAlign: 'center',
    }}
  >
    <div style={{ color, fontSize: 24, fontWeight: 700 }}>{value}</div>
    <div style={{ color: '#9ca3af', fontSize: 13, marginTop: 2 }}>{label}</div>
  </div>
)

const InvestmentNews: React.FC = () => {
  const [input, setInput] = useState('')
  const [ticker, setTicker] = useState('')

  const { data, isLoading, isError, error } = useQuery<NewsResponse, Error>({
    queryKey: ['news-sentiment', ticker],
    queryFn: () => newsApi.getSentiment(ticker),
    enabled: ticker.length > 0,
  })

  const handleSearch = () => {
    const trimmed = input.trim()
    if (trimmed) setTicker(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch()
  }

  const stats = data
    ? {
        positive: data.articles.filter((a) => a.sentiment === 'positive').length,
        negative: data.articles.filter((a) => a.sentiment === 'negative').length,
        neutral: data.articles.filter((a) => a.sentiment === 'neutral').length,
        avg:
          data.articles.reduce((sum, a) => sum + a.compound, 0) /
          (data.articles.length || 1),
      }
    : null

  const overallLabel = stats
    ? stats.avg >= 0.05
      ? 'Bullish'
      : stats.avg <= -0.05
        ? 'Bearish'
        : 'Neutral'
    : null

  const overallColor = stats
    ? stats.avg >= 0.05
      ? '#10b981'
      : stats.avg <= -0.05
        ? '#ef4444'
        : '#eab308'
    : '#9ca3af'

  return (
    <div style={{ padding: '24px 28px', maxWidth: 900 }}>
      <h1 style={{ color: '#f3f4f6', marginBottom: 4 }}>Investment News Sentiment</h1>
      <p style={{ color: '#9ca3af', marginBottom: 24 }}>
        Analyze sentiment of the latest news for any stock or company
      </p>

      {/* Search bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 28 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter stock ticker or company name (e.g. AAPL, Tesla, NVDA)"
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
          onClick={handleSearch}
          disabled={isLoading}
          style={{
            background: '#c084fc',
            border: 'none',
            borderRadius: 8,
            padding: '10px 24px',
            color: '#16171d',
            fontWeight: 700,
            fontSize: 15,
            cursor: isLoading ? 'not-allowed' : 'pointer',
            opacity: isLoading ? 0.7 : 1,
          }}
        >
          {isLoading ? 'Analyzing…' : 'Analyze'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#9ca3af' }}>
          <CSpinner size="sm" />
          Fetching and analyzing news…
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

      {/* Results */}
      {data && stats && (
        <>
          <div style={{ marginBottom: 10 }}>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>
              Showing <strong style={{ color: '#f3f4f6' }}>{data.total}</strong> articles for{' '}
              <strong style={{ color: '#c084fc' }}>{data.ticker}</strong>
            </span>
          </div>

          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
            <StatCard label="Positive" value={stats.positive} color="#10b981" />
            <StatCard label="Neutral" value={stats.neutral} color="#eab308" />
            <StatCard label="Negative" value={stats.negative} color="#ef4444" />
            <StatCard
              label="Overall Sentiment"
              value={overallLabel ?? '—'}
              color={overallColor}
            />
          </div>

          {/* Article list */}
          {data.articles.length === 0 ? (
            <p style={{ color: '#9ca3af' }}>No articles found for this query.</p>
          ) : (
            data.articles.map((article, i) => (
              <ArticleCard key={i} article={article} />
            ))
          )}
        </>
      )}
    </div>
  )
}

export default InvestmentNews
