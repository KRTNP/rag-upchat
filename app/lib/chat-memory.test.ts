import { beforeEach, describe, expect, test } from "vitest"
import { loadPinnedConversationIds, savePinnedConversationIds } from "@/app/lib/chat-memory"

describe("chat memory helpers", () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  test("stores and loads pinned conversations by user", () => {
    savePinnedConversationIds("user-a", ["c1", "c2", "c1"])
    savePinnedConversationIds("user-b", ["x1"])

    expect(loadPinnedConversationIds("user-a")).toEqual(["c1", "c2"])
    expect(loadPinnedConversationIds("user-b")).toEqual(["x1"])
  })

  test("returns empty list when no pinned data", () => {
    expect(loadPinnedConversationIds("unknown")).toEqual([])
  })
})
