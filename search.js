import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export async function searchDocuments(embedding) {

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_count: 3
  })

  if (error) {
    console.error(error)
    return null
  }

  return data
}