type CacheEntry<T> = {
  value: T
  expiresAt: number
}

export class ResponseCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>()

  get(key: string) {
    const now = Date.now()
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt <= now) {
      this.store.delete(key)
      return null
    }

    return entry.value
  }

  set(key: string, value: T, ttlMs: number) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs })
  }
}
