import { getAdminSessionFromRequest } from "@/app/lib/admin-session"

export function assertAdminRequest(req: Request) {
  const session = getAdminSessionFromRequest(req)
  if (session?.role === "admin") {
    return true
  }

  const configuredKey = process.env.ADMIN_API_KEY

  if (!configuredKey) {
    return false
  }

  const headerKey = req.headers.get("x-admin-key")
  const authHeader = req.headers.get("authorization")
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null
  const provided = headerKey ?? bearer

  if (!provided || provided !== configuredKey) {
    return false
  }

  return true
}
