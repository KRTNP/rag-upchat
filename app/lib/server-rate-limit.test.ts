import { describe, expect, test } from "vitest"
import { checkRateLimit } from "@/app/lib/server-rate-limit"

describe("server rate limit", () => {
  test("blocks when request count exceeds limit in same window", async () => {
    const key = `ip-${Date.now()}`
    expect((await checkRateLimit(key, 2, 60_000)).allowed).toBe(true)
    expect((await checkRateLimit(key, 2, 60_000)).allowed).toBe(true)
    expect((await checkRateLimit(key, 2, 60_000)).allowed).toBe(false)
  })
})
