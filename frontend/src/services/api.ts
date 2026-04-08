const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

async function request<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  }

  const res = await fetch(url.toString())
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

// ── News ─────────────────────────────────────────────────────────────────────

export interface Article {
  title: string
  description: string
  url: string
  source: string | null
  publishedAt: string
  urlToImage: string | null
  sentiment: 'positive' | 'negative' | 'neutral'
  compound: number
  positive: number
  negative: number
  neutral: number
}

export interface NewsSentimentResponse {
  ticker: string
  total: number
  articles: Article[]
}

export const newsApi = {
  getSentiment: (ticker: string) =>
    request<NewsSentimentResponse>('/news/sentiment', { ticker }),
}
