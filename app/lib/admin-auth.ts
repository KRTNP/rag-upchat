import { createClient } from "@supabase/supabase-js"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

const ADMIN_ROLES = new Set(["admin", "super_admin"])

function getAdminAuthClient() {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY")
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  })
}

export async function assertAdminRequest(req: Request) {
  const authHeader = req.headers.get("authorization")
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!token) {
    return false
  }

  try {
    const supabase = getAdminAuthClient()
    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data.user) {
      return false
    }

    const roleClient = getSupabaseAdminClient()
    const roleResult = await roleClient
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle<{ role: string }>()

    if (!roleResult.error && roleResult.data?.role && ADMIN_ROLES.has(roleResult.data.role)) {
      return true
    }

    return false
  } catch {
    return false
  }
}
