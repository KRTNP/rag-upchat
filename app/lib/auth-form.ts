export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
}

export function validatePassword(password: string) {
  return password.length >= 6
}

export function validateStrongPassword(password: string) {
  const minLength = password.length >= 8
  const hasLetter = /[A-Za-z]/.test(password)
  const hasNumber = /\d/.test(password)

  return {
    minLength,
    hasLetter,
    hasNumber,
    valid: minLength && hasLetter && hasNumber
  }
}

export function toThaiAuthError(message: string) {
  const lower = message.toLowerCase()

  if (lower.includes("invalid login credentials")) {
    return "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
  }
  if (lower.includes("email not confirmed")) {
    return "บัญชีนี้ยังไม่ยืนยันอีเมล กรุณาตรวจสอบกล่องจดหมาย"
  }
  if (lower.includes("user already registered")) {
    return "อีเมลนี้ถูกใช้งานแล้ว"
  }
  if (lower.includes("password should be at least")) {
    return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร"
  }
  if (lower.includes("for security purposes")) {
    return "ระบบยังไม่อนุญาตให้รีเซ็ตรหัสผ่านซ้ำทันที กรุณาลองใหม่อีกครั้งภายหลัง"
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "ไม่สามารถเชื่อมต่อเครือข่ายได้ กรุณาลองใหม่"
  }

  return message || "เกิดข้อผิดพลาดในการยืนยันตัวตน กรุณาลองใหม่"
}
