import { describe, expect, test } from "vitest"
import { checkRateLimit } from "@/app/lib/server-rate-limit"

describe("server rate limit", () => {
  test("blocks when request count exceeds limit in same window", () => {
    const key = `ip-${Date.now()}`
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true)
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true)
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(false)
  })
})
