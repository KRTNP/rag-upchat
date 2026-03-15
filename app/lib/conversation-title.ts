const DEFAULT_TITLE = "การสนทนาใหม่"
const MAX_TITLE_LENGTH = 56

export function deriveConversationTitle(input: string) {
  const compact = input.replace(/\s+/g, " ").trim()
  if (!compact) {
    return DEFAULT_TITLE
  }

  const clean = compact.replace(/^[-*#>\d.\s]+/, "").trim() || compact
  if (clean.length <= MAX_TITLE_LENGTH) {
    return clean
  }

  return `${clean.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…`
}

export function isAutoTitleCandidate(title: string | null | undefined) {
  const normalized = (title ?? "").trim().toLowerCase()
  return (
    normalized === "" ||
    normalized === "new chat" ||
    normalized === "untitled chat" ||
    normalized === "my conversation" ||
    normalized === "การสนทนาใหม่" ||
    normalized === "การสนทนาของฉัน" ||
    normalized === "นำเข้าประวัติผู้เยี่ยมชม"
  )
}
