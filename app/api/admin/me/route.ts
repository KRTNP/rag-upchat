import { getAdminSessionFromRequest } from "@/app/lib/admin-session"

export async function GET(req: Request) {
  const session = getAdminSessionFromRequest(req)

  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 })
  }

  return Response.json({ authenticated: true, role: session.role })
}
