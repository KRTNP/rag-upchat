import { createHmac, timingSafeEqual } from "node:crypto"

const SESSION_COOKIE = "rag_admin_session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 12

type AdminSessionPayload = {
  role: "admin"
  exp: number
}

function getSessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET")
  }
  return secret
}

function base64UrlEncode(input: string) {
  return Buffer.from(input, "utf8").toString("base64url")
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8")
}

function sign(data: string) {
  return createHmac("sha256", getSessionSecret()).update(data).digest("base64url")
}

export function createAdminSessionToken() {
  const payload: AdminSessionPayload = {
    role: "admin",
    exp: Date.now() + SESSION_TTL_MS
  }

  const encoded = base64UrlEncode(JSON.stringify(payload))
  const signature = sign(encoded)
  return `${encoded}.${signature}`
}

export function verifyAdminSessionToken(token: string) {
  const [encoded, signature] = token.split(".")
  if (!encoded || !signature) {
    return null
  }

  const expected = sign(encoded)
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(encoded)) as AdminSessionPayload
    if (parsed.role !== "admin" || typeof parsed.exp !== "number") {
      return null
    }

    if (Date.now() > parsed.exp) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function getAdminSessionFromRequest(req: Request) {
  const cookie = req.headers.get("cookie") ?? ""
  const parts = cookie.split(";").map((part) => part.trim())
  const matched = parts.find((part) => part.startsWith(`${SESSION_COOKIE}=`))

  if (!matched) {
    return null
  }

  const token = matched.slice(SESSION_COOKIE.length + 1)
  return verifyAdminSessionToken(token)
}

export function buildSessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}
