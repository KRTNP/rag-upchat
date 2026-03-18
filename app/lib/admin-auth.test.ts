import { afterEach, describe, expect, test, vi } from "vitest"
import { assertAdminRequest } from "@/app/lib/admin-auth"

const getUserMock = vi.fn()
const roleMaybeSingleMock = vi.fn()
const roleEqMock = vi.fn()
const roleSelectMock = vi.fn()
const roleFromMock = vi.fn()

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: getUserMock
    }
  })
}))

vi.mock("@/app/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: roleFromMock
  })
}))

describe("assertAdminRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    getUserMock.mockReset()
    roleMaybeSingleMock.mockReset()
    roleEqMock.mockReset()
    roleSelectMock.mockReset()
    roleFromMock.mockReset()
  })

  function arrangeRoleQuery(role: string | null) {
    roleMaybeSingleMock.mockResolvedValue(role ? { data: { role }, error: null } : { data: null, error: null })
    roleEqMock.mockReturnValue({ maybeSingle: roleMaybeSingleMock })
    roleSelectMock.mockReturnValue({ eq: roleEqMock })
    roleFromMock.mockReturnValue({ select: roleSelectMock })
  }

  test("returns false without bearer token", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    const req = new Request("http://localhost")

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })

  test("returns false for authenticated user when role is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "admin@example.com" } }, error: null })
    arrangeRoleQuery(null)

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })

  test("returns true when user role is admin", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "admin@example.com" } }, error: null })
    arrangeRoleQuery("admin")

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(true)
  })

  test("returns true when user role is super_admin", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "admin@example.com" } }, error: null })
    arrangeRoleQuery("super_admin")

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(true)
  })

  test("returns false for unsupported role", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "other@example.com" } }, error: null })
    arrangeRoleQuery("user")

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })

  test("ignores ADMIN_ALLOWED_EMAILS when role is missing", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
    vi.stubEnv("SUPABASE_ANON_KEY", "anon-key")
    vi.stubEnv("ADMIN_ALLOWED_EMAILS", "admin@example.com")
    getUserMock.mockResolvedValue({ data: { user: { id: "user-1", email: "admin@example.com" } }, error: null })
    arrangeRoleQuery(null)

    const req = new Request("http://localhost", {
      headers: {
        authorization: "Bearer token-1"
      }
    })

    await expect(assertAdminRequest(req)).resolves.toBe(false)
  })
})
