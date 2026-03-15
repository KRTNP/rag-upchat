import { Redis } from "@upstash/redis"

type InMemoryEntry = {
  value: number
  expiresAt: number
}

const memoryStore = new Map<string, InMemoryEntry>()

function nowMs() {
  return Date.now()
}

function readMemory(key: string) {
  const entry = memoryStore.get(key)
  if (!entry) return null
  if (entry.expiresAt <= nowMs()) {
    memoryStore.delete(key)
    return null
  }
  return entry
}

function getRedisClient() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return new Redis({ url, token })
}

export async function getCooldownRemainingSec(key: string) {
  const redis = getRedisClient()
  if (redis) {
    try {
      const ttl = await redis.ttl(key)
      return typeof ttl === "number" && ttl > 0 ? ttl : 0
    } catch {
      // fallback to memory
    }
  }

  const entry = readMemory(key)
  if (!entry) return 0
  return Math.max(Math.ceil((entry.expiresAt - nowMs()) / 1000), 0)
}

export async function setCooldownSec(key: string, seconds: number) {
  const ttlSec = Math.max(1, Math.ceil(seconds))
  const redis = getRedisClient()
  if (redis) {
    try {
      await redis.set(key, 1, { ex: ttlSec })
      return
    } catch {
      // fallback to memory
    }
  }

  memoryStore.set(key, { value: 1, expiresAt: nowMs() + ttlSec * 1000 })
}

export async function incrementWithinWindow(key: string, windowSec: number) {
  const redis = getRedisClient()
  if (redis) {
    try {
      const count = await redis.incr(key)
      if (count === 1) {
        await redis.expire(key, windowSec)
      }

      const ttl = await redis.ttl(key)
      return { count, ttlSec: typeof ttl === "number" && ttl > 0 ? ttl : windowSec }
    } catch {
      // fallback to memory
    }
  }

  const current = readMemory(key)
  if (!current) {
    memoryStore.set(key, { value: 1, expiresAt: nowMs() + windowSec * 1000 })
    return { count: 1, ttlSec: windowSec }
  }

  current.value += 1
  memoryStore.set(key, current)
  return {
    count: current.value,
    ttlSec: Math.max(Math.ceil((current.expiresAt - nowMs()) / 1000), 1)
  }
}
