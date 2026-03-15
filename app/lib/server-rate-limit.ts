import { incrementWithinWindow } from "@/app/lib/shared-runtime-state"

export async function checkRateLimit(key: string, limit: number, windowMs: number) {
  const windowSec = Math.max(Math.ceil(windowMs / 1000), 1)
  const result = await incrementWithinWindow(key, windowSec)

  if (result.count > limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(result.ttlSec, 1) }
  }

  return {
    allowed: true,
    remaining: Math.max(limit - result.count, 0),
    retryAfterSec: Math.max(result.ttlSec, 1)
  }
}
