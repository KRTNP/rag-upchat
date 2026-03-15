export type FlexibleDoc = {
  id?: number
  content?: string | null
  question?: string | null
  answer?: string | null
}

export function docToText(doc: FlexibleDoc) {
  const content = doc.content?.trim()
  if (content) return content

  const question = doc.question?.trim() ?? ""
  const answer = doc.answer?.trim() ?? ""
  return `${question} ${answer}`.trim()
}
