import type { ChatMessage } from "@/app/lib/chat-types"

export const CHAT_MESSAGES_STORAGE_KEY = "rag-upchat:messages"

function isChatMessageLike(value: unknown): value is Partial<ChatMessage> & { id: string; text: string } {
  if (!value || typeof value !== "object") {
    return false
  }

  const candidate = value as Partial<ChatMessage>
  return (
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    (candidate.role === "user" || candidate.role === "bot")
  )
}

export function loadMessagesFromStorage(): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(CHAT_MESSAGES_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(isChatMessageLike).map((message) => ({
      id: message.id,
      role: message.role ?? "bot",
      text: message.text,
      createdAt: typeof message.createdAt === "string" ? message.createdAt : new Date().toISOString()
    }))
  } catch {
    return []
  }
}

export function saveMessagesToStorage(messages: ChatMessage[]) {
  window.localStorage.setItem(CHAT_MESSAGES_STORAGE_KEY, JSON.stringify(messages))
}
