import { describe, expect, test, vi } from "vitest"
import { ResponseCache } from "@/app/lib/response-cache"

describe("response cache", () => {
  test("returns cached value before ttl expires", () => {
    vi.useFakeTimers()
    const cache = new ResponseCache<string>()
    cache.set("k", "v", 1_000)

    expect(cache.get("k")).toBe("v")
    vi.advanceTimersByTime(999)
    expect(cache.get("k")).toBe("v")
    vi.useRealTimers()
  })

  test("expires value after ttl", () => {
    vi.useFakeTimers()
    const cache = new ResponseCache<string>()
    cache.set("k", "v", 1_000)
    vi.advanceTimersByTime(1_001)
    expect(cache.get("k")).toBeNull()
    vi.useRealTimers()
  })
})
