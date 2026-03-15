"use client"

import { FormEvent, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Eye, EyeOff, UserPlus } from "lucide-react"
import { signUpWithPassword } from "@/app/lib/chat-memory"
import { isValidEmail, toThaiAuthError, validateStrongPassword } from "@/app/lib/auth-form"

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const emailError = email.length > 0 && !isValidEmail(email) ? "รูปแบบอีเมลไม่ถูกต้อง" : null
  const passwordRules = validateStrongPassword(password)
  const passwordError = password.length > 0 && !passwordRules.valid ? "รหัสผ่านยังไม่ผ่านเงื่อนไขความปลอดภัย" : null
  const confirmPasswordError =
    confirmPassword.length > 0 && confirmPassword !== password ? "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน" : null

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!email.trim() || !password || !confirmPassword || emailError || passwordError || confirmPasswordError) {
      setError("กรุณากรอกข้อมูลให้ถูกต้องก่อนสมัครสมาชิก")
      return
    }

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const authResult = await signUpWithPassword(email.trim(), password)

      if (authResult.error) {
        throw new Error(authResult.error.message)
      }

      if (!authResult.data.user) {
        setMessage("สมัครสมาชิกสำเร็จ ระบบส่งอีเมลยืนยันแล้ว กรุณาตรวจสอบกล่องจดหมายหรือสแปม")
        return
      }

      setMessage("สมัครสมาชิกสำเร็จ กำลังพากลับหน้าแชท...")
      router.push("/")
      router.refresh()
    } catch (submitError) {
      const nextError = submitError instanceof Error ? submitError.message : "ไม่สามารถสมัครสมาชิกได้"
      setError(toThaiAuthError(nextError))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-label="Signup form">
        <p className="chat-kicker">มหาวิทยาลัยพะเยา</p>
        <h1>สมัครสมาชิก</h1>
        <p className="auth-subtitle">สร้างบัญชีเพื่อเก็บประวัติการสนทนาและใช้งานระบบได้ต่อเนื่อง</p>

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
                  placeholder="อย่างน้อย 8 ตัว มีตัวอักษรและตัวเลข"
                  autoComplete="new-password"
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
            <ul className="password-rules" aria-live="polite">
              <li className={passwordRules.minLength ? "ok" : ""}>อย่างน้อย 8 ตัวอักษร</li>
              <li className={passwordRules.hasLetter ? "ok" : ""}>มีตัวอักษรอย่างน้อย 1 ตัว</li>
              <li className={passwordRules.hasNumber ? "ok" : ""}>มีตัวเลขอย่างน้อย 1 ตัว</li>
            </ul>
          </div>

          <div>
            <label>
              ยืนยันรหัสผ่าน
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value)
                  if (error) setError(null)
                }}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                autoComplete="new-password"
              />
            </label>
            {confirmPasswordError ? <p className="auth-field-error">{confirmPasswordError}</p> : null}
          </div>

          {error ? <p className="auth-error">{error}</p> : null}
          {message ? <p className="auth-success">{message}</p> : null}

          <button className="auth-link-button" type="submit" disabled={loading}>
            <UserPlus size={16} />
            {loading ? "กำลังสมัครสมาชิก..." : "สมัครสมาชิก"}
          </button>
        </form>

        <p className="auth-footer">
          มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link>
        </p>
        <p className="auth-footer auth-back-link">
          <Link href="/">กลับไปหน้าแชท</Link>
        </p>
      </section>
    </main>
  )
}
