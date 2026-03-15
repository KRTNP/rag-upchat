const CLIENT_QUOTA_KEY = "rag-upchat:client-quota"

type QuotaBucket = {
  day: string
  used: number
}

type QuotaMap = Record<string, QuotaBucket>

function getDayKey() {
  return new Date().toISOString().slice(0, 10)
}

function readQuotaMap(): QuotaMap {
  try {
    const raw = window.localStorage.getItem(CLIENT_QUOTA_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as QuotaMap
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function writeQuotaMap(map: QuotaMap) {
  window.localStorage.setItem(CLIENT_QUOTA_KEY, JSON.stringify(map))
}

export function consumeGuestDailyQuota(limit: number, scope = "guest") {
  const today = getDayKey()
  const all = readQuotaMap()
  const current = all[scope]

  if (!current || current.day !== today) {
    all[scope] = { day: today, used: 1 }
    writeQuotaMap(all)
    return { allowed: true, remaining: Math.max(limit - 1, 0), used: 1, limit }
  }

  if (current.used >= limit) {
    return { allowed: false, remaining: 0, used: current.used, limit }
  }

  current.used += 1
  all[scope] = current
  writeQuotaMap(all)
  return { allowed: true, remaining: Math.max(limit - current.used, 0), used: current.used, limit }
}
