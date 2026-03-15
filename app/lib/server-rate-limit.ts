type RateLimitRecord = {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitRecord>()

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = store.get(key)

  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: Math.max(limit - 1, 0), retryAfterSec: Math.ceil(windowMs / 1000) }
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1) }
  }

  current.count += 1
  store.set(key, current)
  return { allowed: true, remaining: Math.max(limit - current.count, 0), retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 1) }
}
