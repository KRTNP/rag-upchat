import type { ChatMessage } from "@/app/lib/chat-types"

export const STATIC_QUICK_QUESTIONS = [
  "สรุปสิ่งที่เราคุยกันล่าสุดให้หน่อย",
  "ช่วยอธิบายแบบสั้น ๆ สำหรับมือใหม่",
  "ถ้าต้องลงมือทำจริง ควรเริ่มจากขั้นตอนไหน"
]

export function buildDynamicQuickQuestions(messages: ChatMessage[]) {
  const lastBot = [...messages].reverse().find((item) => item.role === "bot")
  if (lastBot?.text) {
    const suggestionLines = lastBot.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith("- "))
      .map((line) => line.replace(/^-+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3)

    if (suggestionLines.length > 0) {
      return suggestionLines
    }
  }

  const lastUser = [...messages].reverse().find((item) => item.role === "user")

  if (!lastUser) {
    return []
  }

  const snippet = lastUser.text.replace(/\s+/g, " ").trim().slice(0, 42)

  return [
    `จากเรื่อง \"${snippet}\" มีข้อยกเว้นอะไรบ้าง`,
    `ช่วยเปรียบเทียบทางเลือกที่เกี่ยวกับ \"${snippet}\" ให้หน่อย`
  ]
}
