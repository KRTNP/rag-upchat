import { supabase } from "@/app/lib/supabase"
import { getEmbedding } from "@/app/api/embed/route"

export async function searchDocuments(query: string) {

  const queryEmbedding = await getEmbedding(query)

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: queryEmbedding,
    match_threshold: 0.5,
    match_count: 3
  })

  if (error) {
    console.error(error)
    return []
  }

  return data
}