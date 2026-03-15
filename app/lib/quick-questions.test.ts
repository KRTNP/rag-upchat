import { describe, expect, test } from "vitest"
import { buildDynamicQuickQuestions } from "@/app/lib/quick-questions"
import type { ChatMessage } from "@/app/lib/chat-types"

function makeMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: `${role}-1`,
    role,
    text,
    createdAt: new Date().toISOString()
  }
}

describe("buildDynamicQuickQuestions", () => {
  test("returns empty list when no chat context is available", () => {
    expect(buildDynamicQuickQuestions([])).toEqual([])
    expect(buildDynamicQuickQuestions([makeMessage("bot", "สวัสดีครับ")])).toEqual([])
  })

  test("extracts suggestion bullets from latest bot message when available", () => {
    const messages = [
      makeMessage("user", "ผมอยากส่ง กยศ ต้องไปที่ไหน"),
      makeMessage(
        "bot",
        "ยังไม่เจอข้อมูลที่มั่นใจพอ\nตัวอย่างหัวข้อที่ใกล้เคียง:\n- ขั้นตอนการลงทะเบียนแอป กยศ. Connect\n- การเปิดบัญชีธนาคาร กยศ. ต้องใช้ธนาคารอะไร"
      )
    ]

    const questions = buildDynamicQuickQuestions(messages)
    expect(questions).toEqual(["ขั้นตอนการลงทะเบียนแอป กยศ. Connect", "การเปิดบัญชีธนาคาร กยศ. ต้องใช้ธนาคารอะไร"])
  })

  test("builds follow-up suggestions from latest user message", () => {
    const questions = buildDynamicQuickQuestions([makeMessage("user", "ผมอยากส่ง กยศ ต้องไปที่ไหน")])
    expect(questions.length).toBe(2)
    expect(questions[0]).toContain("จากเรื่อง")
  })
})
