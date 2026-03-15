"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, KeyRound, LogIn } from "lucide-react"
import { getCurrentUser, loginWithPassword, requestPasswordReset } from "@/app/lib/chat-memory"
import { isValidEmail, toThaiAuthError, validatePassword } from "@/app/lib/auth-form"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [nextPath, setNextPath] = useState("/")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [showPassword, setShowPassword] = useState(false)

  const signupLink = useMemo(() => {
    const params = new URLSearchParams()
    if (nextPath && nextPath !== "/") params.set("next", nextPath)
    return params.toString() ? `/signup?${params.toString()}` : "/signup"
  }, [nextPath])

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    const next = params.get("next")?.trim()
    if (next && next.startsWith("/")) {
      setNextPath(next)
    }
    const fromEmail = params.get("email")
    if (fromEmail?.trim()) {
      setEmail(fromEmail.trim())
    }
  }, [])

  useEffect(() => {
    let mounted = true
    getCurrentUser()
      .then((user) => {
        if (!mounted) return
        if (user) {
          router.replace(nextPath)
          return
        }
        setCheckingSession(false)
      })
      .catch(() => {
        if (!mounted) return
        setCheckingSession(false)
      })
    return () => {
      mounted = false
    }
  }, [nextPath, router])

  const emailError = email.length > 0 && !isValidEmail(email) ? "รูปแบบอีเมลไม่ถูกต้อง" : null
  const passwordError = password.length > 0 && !validatePassword(password) ? "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร" : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim() || !password || emailError || passwordError) {
      setError("กรุณากรอกข้อมูลให้ถูกต้องก่อนเข้าสู่ระบบ")
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const authResult = await loginWithPassword(email.trim(), password)

      if (authResult.error) {
        throw new Error(authResult.error.message)
      }

      setMessage("เข้าสู่ระบบสำเร็จ กำลังพากลับ...")
      router.replace(nextPath)
      router.refresh()
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : "ไม่สามารถเข้าสู่ระบบได้"
      setError(toThaiAuthError(nextError))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!isValidEmail(email)) {
      setError("กรุณากรอกอีเมลที่ถูกต้องก่อนรีเซ็ตรหัสผ่าน")
      return
    }

    setResetLoading(true)
    setError(null)
    setMessage(null)

    try {
      const redirectTo =
        typeof window !== "undefined"
          ? `${window.location.origin}/login?email=${encodeURIComponent(email.trim())}${nextPath !== "/" ? `&next=${encodeURIComponent(nextPath)}` : ""}`
          : undefined
      const resetResult = await requestPasswordReset(email.trim(), redirectTo)
      if (resetResult.error) {
        throw new Error(resetResult.error.message)
      }
      setMessage("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว กรุณาตรวจสอบอีเมล (รวมถึงโฟลเดอร์สแปม)")
    } catch (resetError) {
      const nextError = resetError instanceof Error ? resetError.message : "ไม่สามารถส่งลิงก์รีเซ็ตรหัสผ่านได้"
      setError(toThaiAuthError(nextError))
    } finally {
      setResetLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Login form">
        {checkingSession ? <p className="auth-subtitle">กำลังตรวจสอบสถานะผู้ใช้...</p> : null}
        <p className="chat-kicker">มหาวิทยาลัยพะเยา</p>
        <h1>เข้าสู่ระบบ</h1>
        <p className="auth-subtitle">ลงชื่อเข้าใช้เพื่อซิงค์ประวัติแชทและจัดการบทสนทนาข้ามอุปกรณ์</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            อีเมล
            <input
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
                if (error) setError(null)
              }}
              placeholder="you@up.ac.th"
              autoComplete="email"
            />
            {emailError ? <p className="auth-field-error">{emailError}</p> : null}
          </label>

          <div>
            <label className="auth-password-label">
              รหัสผ่าน
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    if (error) setError(null)
                  }}
                  placeholder="รหัสผ่าน"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                  title={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            {passwordError ? <p className="auth-field-error">{passwordError}</p> : null}
          </div>

          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-success">{message}</p> : null}

          <button className="auth-link-button" type="submit" disabled={loading || checkingSession}>
            <LogIn size={16} />
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>

          <button className="auth-secondary-button" type="button" onClick={handleForgotPassword} disabled={resetLoading || checkingSession}>
            <KeyRound size={16} />
            {resetLoading ? "กำลังส่งลิงก์..." : "ลืมรหัสผ่าน"}
          </button>
        </form>

        <p className="auth-footer">
          ยังไม่มีบัญชี? <Link href={signupLink}>สมัครสมาชิก</Link>
        </p>
        <p className="auth-footer auth-back-link">
          <Link href="/">กลับไปหน้าแชท</Link>
        </p>
      </section>
    </main>
  )
}
