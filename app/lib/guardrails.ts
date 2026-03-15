type ProhibitedCheckResult = {
  blocked: boolean
  keyword?: string
}

const DEFAULT_PROHIBITED_KEYWORDS = [
  "jailbreak",
  "prompt injection",
  "sqlmap",
  "phishing",
  "ddos",
  "xss",
  "ยาเสพติด",
  "พนันออนไลน์",
  "ทำระเบิด"
]

const IN_SCOPE_KEYWORDS = [
  "กยศ",
  "กู้ยืม",
  "ทุน",
  "นิสิต",
  "มหาวิทยาลัย",
  "พะเยา",
  "ลงทะเบียน",
  "ปฏิทินการศึกษา",
  "บัณฑิตศึกษา",
  "เทอม",
  "ค่าเทอม",
  "เอกสารกู้"
]

export function parseProhibitedKeywords(raw: string | undefined) {
  if (!raw?.trim()) {
    return DEFAULT_PROHIBITED_KEYWORDS
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export function checkProhibitedKeyword(input: string, keywords: string[]): ProhibitedCheckResult {
  const normalized = input.toLowerCase()
  const matched = keywords.find((keyword) => normalized.includes(keyword))
  if (!matched) return { blocked: false }
  return { blocked: true, keyword: matched }
}

export function isOutOfScopeQuestion(question: string, maxSimilarity: number) {
  const normalized = question.toLowerCase()
  const inScope = IN_SCOPE_KEYWORDS.some((keyword) => normalized.includes(keyword))
  if (inScope) return false
  return maxSimilarity < 0.35
}
