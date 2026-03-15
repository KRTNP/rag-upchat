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

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return { url, token } as const
}

async function runRedisCommand(command: Array<string | number>) {
  const config = getRedisConfig()
  if (!config) {
    return null
  }

  try {
    const res = await fetch(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ command })
    })

    if (!res.ok) {
      return null
    }

    const data = (await res.json()) as { result?: unknown }
    return data.result ?? null
  } catch {
    return null
  }
}

export async function getCooldownRemainingSec(key: string) {
  const ttl = await runRedisCommand(["TTL", key])
  if (typeof ttl === "number" && ttl > 0) {
    return ttl
  }

  const entry = readMemory(key)
  if (!entry) return 0
  return Math.max(Math.ceil((entry.expiresAt - nowMs()) / 1000), 0)
}

export async function setCooldownSec(key: string, seconds: number) {
  const ttlSec = Math.max(1, Math.ceil(seconds))
  const result = await runRedisCommand(["SET", key, 1, "EX", ttlSec])
  if (typeof result === "string" && result.toUpperCase() === "OK") {
    return
  }

  memoryStore.set(key, { value: 1, expiresAt: nowMs() + ttlSec * 1000 })
}

export async function incrementWithinWindow(key: string, windowSec: number) {
  const count = await runRedisCommand(["INCR", key])
  if (typeof count === "number") {
    if (count === 1) {
      await runRedisCommand(["EXPIRE", key, windowSec])
    }
    const ttl = await runRedisCommand(["TTL", key])
    return { count, ttlSec: typeof ttl === "number" && ttl > 0 ? ttl : windowSec }
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
