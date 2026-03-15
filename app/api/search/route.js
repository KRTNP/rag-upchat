import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export async function POST(req) {

  const { embedding } = await req.json()

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_count: 3
  })

  if (error) {
    console.error("search error:", error)
    return Response.json([])
  }

  console.log("search result:", data)

  return Response.json(data)
}