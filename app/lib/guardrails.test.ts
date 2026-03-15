import { describe, expect, test } from "vitest"
import { checkProhibitedKeyword, isOutOfScopeQuestion, parseProhibitedKeywords } from "@/app/lib/guardrails"

describe("guardrails", () => {
  test("parses prohibited keywords from env", () => {
    expect(parseProhibitedKeywords("hack, phishing , xss")).toEqual(["hack", "phishing", "xss"])
  })

  test("blocks prohibited keyword in message", () => {
    const result = checkProhibitedKeyword("ช่วยสอน phishing หน่อย", ["phishing"])
    expect(result.blocked).toBe(true)
    expect(result.keyword).toBe("phishing")
  })

  test("marks out-of-scope when no domain keyword and low similarity", () => {
    expect(isOutOfScopeQuestion("พยากรณ์อากาศวันพรุ่งนี้", 0.05)).toBe(true)
    expect(isOutOfScopeQuestion("อยากรู้เรื่องกยศ", 0.05)).toBe(false)
  })
})
