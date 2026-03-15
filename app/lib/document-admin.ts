import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

export type DocumentRow = {
  id: number
  content: string
  embedding: number[] | null
}

export function combineDocumentText(question: string, answer: string) {
  return `คำถาม: ${question.trim()} คำตอบ: ${answer.trim()}`.trim()
}

export function splitDocumentText(content: string) {
  const raw = content.trim()
  const match = raw.match(/คำถาม:\s*([\s\S]*?)\s*คำตอบ:\s*([\s\S]*)$/)

  if (!match) {
    return {
      question: raw.slice(0, 140),
      answer: raw
    }
  }

  return {
    question: match[1].trim(),
    answer: match[2].trim()
  }
}

export async function reembedDocumentById(id: number) {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id,content")
    .eq("id", id)
    .maybeSingle<{ id: number; content: string }>()

  if (error) {
    throw new Error(`Fetch document failed: ${error.message}`)
  }

  if (!data) {
    throw new Error("Document not found")
  }

  const embedding = await getEmbedding(data.content)

  const { error: updateError } = await supabase.from("documents").update({ embedding }).eq("id", id)

  if (updateError) {
    throw new Error(`Update embedding failed: ${updateError.message}`)
  }

  return { id }
}

export async function reembedAllDocuments() {
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from("documents")
    .select("id,content")
    .order("id", { ascending: true })

  if (error) {
    throw new Error(`Load documents failed: ${error.message}`)
  }

  const docs = (data ?? []) as Array<{ id: number; content: string }>
  let success = 0
  const failed: Array<{ id: number; reason: string }> = []

  for (const doc of docs) {
    try {
      const embedding = await getEmbedding(doc.content)
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
