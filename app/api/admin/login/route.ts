import { buildSessionCookie, createAdminSessionToken } from "@/app/lib/admin-session"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { username?: string; password?: string }
    const username = body.username?.trim() ?? ""
    const password = body.password ?? ""

    const configuredUser = process.env.ADMIN_USERNAME
    const configuredPassword = process.env.ADMIN_PASSWORD

    if (!configuredUser || !configuredPassword) {
      return Response.json({ error: "Missing ADMIN_USERNAME or ADMIN_PASSWORD" }, { status: 500 })
    }

    if (username !== configuredUser || password !== configuredPassword) {
      return Response.json({ error: "Invalid credentials" }, { status: 401 })
    }

    const token = createAdminSessionToken()
    return new Response(JSON.stringify({ ok: true, role: "admin" }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": buildSessionCookie(token)
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
