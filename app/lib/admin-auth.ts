import { createClient } from "@supabase/supabase-js"

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

    const allowedRaw = process.env.ADMIN_ALLOWED_EMAILS ?? ""
    const allowedEmails = allowedRaw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)

    if (allowedEmails.length === 0) {
      return true
    }

    return allowedEmails.includes((data.user.email ?? "").toLowerCase())
  } catch {
    return false
  }
}
