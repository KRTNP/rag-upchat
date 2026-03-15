export type ChatRole = "user" | "bot"

export type ChatMessage = {
  id: string
  role: ChatRole
  text: string
  createdAt: string
}
