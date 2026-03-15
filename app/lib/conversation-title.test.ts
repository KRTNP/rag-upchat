import { describe, expect, test } from "vitest"
import { deriveConversationTitle, isAutoTitleCandidate } from "@/app/lib/conversation-title"

describe("conversation title helpers", () => {
  test("creates compact title from first user message", () => {
    expect(deriveConversationTitle("   สรุปเคสนี้   แบบละเอียดหน่อย ")).toBe("สรุปเคสนี้ แบบละเอียดหน่อย")
  })

  test("truncates very long titles", () => {
    const title = deriveConversationTitle(
      "นี่คือข้อความยาวมากที่เกินกว่าความยาวที่ควรแสดงในรายการห้องแชท และควรถูกตัดทอน"
    )
    expect(title.endsWith("…")).toBe(true)
    expect(title.length).toBeLessThanOrEqual(56)
  })

  test("detects generic auto titles", () => {
    expect(isAutoTitleCandidate("New chat")).toBe(true)
    expect(isAutoTitleCandidate("My conversation")).toBe(true)
    expect(isAutoTitleCandidate("Project scope review")).toBe(false)
  })
})
