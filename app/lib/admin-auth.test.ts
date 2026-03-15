import { afterEach, describe, expect, test, vi } from "vitest"
import { assertAdminRequest } from "@/app/lib/admin-auth"
import { createAdminSessionToken } from "@/app/lib/admin-session"

describe("assertAdminRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("returns true for matching x-admin-key", () => {
    vi.stubEnv("ADMIN_API_KEY", "secret-1")
    const req = new Request("http://localhost", {
      headers: {
        "x-admin-key": "secret-1"
      }
    })

    expect(assertAdminRequest(req)).toBe(true)
  })

  test("returns false when key mismatch", () => {
    vi.stubEnv("ADMIN_API_KEY", "secret-1")
    const req = new Request("http://localhost", {
      headers: {
        "x-admin-key": "bad"
      }
    })

    expect(assertAdminRequest(req)).toBe(false)
  })

  test("returns true for valid admin session cookie", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "session-secret")
    const token = createAdminSessionToken()
    const req = new Request("http://localhost", {
      headers: {
        cookie: `rag_admin_session=${token}`
      }
    })

    expect(assertAdminRequest(req)).toBe(true)
  })
})
