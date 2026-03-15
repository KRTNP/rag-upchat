import { clearSessionCookie } from "@/app/lib/admin-session"

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": clearSessionCookie()
    }
  })
}
