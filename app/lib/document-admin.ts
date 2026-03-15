import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

export type DocumentRow = {
  id: number
  question: string
  answer: string
  embedding: number[] | null
}

export function combineDocumentText(question: string, answer: string) {
  return `${question.trim()} ${answer.trim()}`.trim()
}

export async function reembedDocumentById(id: number) {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id,question,answer")
    .eq("id", id)
    .maybeSingle()

  if (error) {
    throw new Error(`Fetch document failed: ${error.message}`)
  }

  if (!data) {
    throw new Error("Document not found")
  }

  const embedding = await getEmbedding(combineDocumentText(data.question, data.answer))

  const { error: updateError } = await supabase
    .from("documents")
    .update({ embedding })
    .eq("id", id)

  if (updateError) {
    throw new Error(`Update embedding failed: ${updateError.message}`)
  }

  return { id }
}

export async function reembedAllDocuments() {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id,question,answer")
    .order("id", { ascending: true })

  if (error) {
    throw new Error(`Load documents failed: ${error.message}`)
  }

  const docs = data ?? []
  let success = 0
  const failed: Array<{ id: number; reason: string }> = []

  for (const doc of docs) {
    try {
      const embedding = await getEmbedding(combineDocumentText(doc.question, doc.answer))
      const { error: updateError } = await supabase.from("documents").update({ embedding }).eq("id", doc.id)
      if (updateError) {
        throw new Error(updateError.message)
      }
      success += 1
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown error"
      failed.push({ id: doc.id, reason })
    }
  }

  return {
    total: docs.length,
    success,
    failed
  }
}
