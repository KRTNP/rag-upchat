import { assertAdminRequest } from "@/app/lib/admin-auth"
import { parseCsvRows } from "@/app/lib/admin-csv"
import { combineDocumentText } from "@/app/lib/document-admin"
import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

export async function POST(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { csvText?: string; embedNow?: boolean }
    const csvText = body.csvText ?? ""
    const embedNow = body.embedNow ?? true

    const rows = parseCsvRows(csvText)
    if (rows.length === 0) {
      return Response.json({ error: "No valid rows found in CSV input" }, { status: 400 })
    }

    const payload = rows.map((row) => ({
      content: combineDocumentText(row.question, row.answer)
    }))

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase.from("documents").insert(payload).select("id,content")

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (!embedNow) {
      return Response.json({ imported: data?.length ?? 0, embedded: 0, failed: [] })
    }

    let embedded = 0
    const failed: Array<{ id: number; reason: string }> = []

    for (const row of (data ?? []) as Array<{ id: number; content: string }>) {
      try {
        const embedding = await getEmbedding(row.content)
        const { error: embedError } = await supabase.from("documents").update({ embedding }).eq("id", row.id)
        if (embedError) {
          throw new Error(embedError.message)
        }
        embedded += 1
      } catch (error) {
        const reason = error instanceof Error ? error.message : "Unknown error"
        failed.push({ id: row.id, reason })
      }
    }

    return Response.json({ imported: data?.length ?? 0, embedded, failed })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
