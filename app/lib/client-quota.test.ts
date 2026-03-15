import { beforeEach, describe, expect, test } from "vitest"
import { consumeGuestDailyQuota } from "@/app/lib/client-quota"

describe("client quota", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test("allows until limit and blocks after", () => {
    const limit = 2
    expect(consumeGuestDailyQuota(limit).allowed).toBe(true)
    expect(consumeGuestDailyQuota(limit).allowed).toBe(true)
    expect(consumeGuestDailyQuota(limit).allowed).toBe(false)
  })
})
