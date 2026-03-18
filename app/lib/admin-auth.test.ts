import { afterEach, describe, expect, test, vi } from "vitest"
import { assertAdminRequest } from "@/app/lib/admin-auth"

const getUserMock = vi.fn()

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock
    }
  })
}))

describe("assertAdminRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    getUserMock.mockReset()
  })

  test("returns false without bearer token", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    const req = new Request("http://localhost")

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })

  test("returns false for authenticated user when ADMIN_ALLOWED_EMAILS is empty", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: { email: "admin@example.com" } }, error: null })

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })

  test("returns true when authenticated user email is in ADMIN_ALLOWED_EMAILS", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("ADMIN_ALLOWED_EMAILS", "admin@example.com")
    getUserMock.mockResolvedValue({ data: { user: { email: "admin@example.com" } }, error: null })

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(true)
  })

  test("respects ADMIN_ALLOWED_EMAILS when configured", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("ADMIN_ALLOWED_EMAILS", "admin@example.com")
    getUserMock.mockResolvedValue({ data: { user: { email: "other@example.com" } }, error: null })

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })
})
