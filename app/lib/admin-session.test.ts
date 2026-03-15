import { afterEach, describe, expect, test, vi } from "vitest"
import { createAdminSessionToken, getAdminSessionFromRequest, verifyAdminSessionToken } from "@/app/lib/admin-session"

describe("admin session", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  test("creates and verifies token", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "super-secret")

    const token = createAdminSessionToken()
    const payload = verifyAdminSessionToken(token)

    expect(payload?.role).toBe("admin")
  })

  test("reads session from cookie", () => {
    vi.stubEnv("ADMIN_SESSION_SECRET", "super-secret")

    const token = createAdminSessionToken()
    const req = new Request("http://localhost", {
      headers: {
        cookie: `rag_admin_session=${token}`
      }
    })

    const session = getAdminSessionFromRequest(req)
    expect(session?.role).toBe("admin")
  })
})
