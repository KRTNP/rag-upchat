import { assertAdminRequest } from "@/app/lib/admin-auth"
import { parseCsvRows, validateCsvText } from "@/app/lib/admin-csv"
import { combineDocumentText } from "@/app/lib/document-admin"
import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

function isDuplicateDocumentPkError(message: string) {
  const text = message.toLowerCase()
  return text.includes("documents_pkey") || text.includes("duplicate key value")
}

export async function POST(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { csvText?: string; embedNow?: boolean; dedupeByContent?: boolean }
    const csvText = body.csvText ?? ""
    const embedNow = body.embedNow ?? true
    const dedupeByContent = body.dedupeByContent ?? true

    const validation = validateCsvText(csvText)
    if (!validation.valid) {
      return Response.json({ error: validation.errors.join(" | "), validation }, { status: 400 })
    }

    const rows = parseCsvRows(csvText)
    if (rows.length === 0) {
      return Response.json({ error: "No valid rows found in CSV input" }, { status: 400 })
    }

    const payload = rows.map((row) => ({
      content: combineDocumentText(row.question, row.answer)
    }))
    const uniquePayload = Array.from(new Set(payload.map((row) => row.content))).map((content) => ({ content }))
    let insertPayload = uniquePayload
    let skippedDuplicates = payload.length - uniquePayload.length

    const supabase = getSupabaseAdminClient()
    if (dedupeByContent && uniquePayload.length > 0) {
      const existing = new Set<string>()
      for (let index = 0; index < uniquePayload.length; index += 200) {
        const chunk = uniquePayload.slice(index, index + 200).map((row) => row.content)
        const lookup = await supabase.from("documents").select("content").in("content", chunk)
        if (lookup.error) {
          return Response.json({ error: lookup.error.message }, { status: 500 })
        }
        for (const row of (lookup.data ?? []) as Array<{ content: string }>) {
          existing.add(row.content)
        }
      }

      if (existing.size > 0) {
        insertPayload = uniquePayload.filter((row) => !existing.has(row.content))
        skippedDuplicates += uniquePayload.length - insertPayload.length
      }
    }

    if (insertPayload.length === 0) {
      return Response.json({ imported: 0, embedded: 0, failed: [], skippedDuplicates })
    }

    let { data, error } = await supabase.from("documents").insert(insertPayload).select("id,content")

    if (error && isDuplicateDocumentPkError(error.message)) {
      const last = await supabase.from("documents").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
      if (last.error) {
        return Response.json({ error: last.error.message }, { status: 500 })
      }

      const baseId = ((last.data as { id?: number } | null)?.id ?? 0) + 1
      const payloadWithIds = insertPayload.map((row, index) => ({
        id: baseId + index,
        content: row.content
      }))
      const retry = await supabase.from("documents").insert(payloadWithIds).select("id,content")
      data = retry.data
      error = retry.error
    }

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (!embedNow) {
      return Response.json({ imported: data?.length ?? 0, embedded: 0, failed: [], skippedDuplicates })
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

    return Response.json({ imported: data?.length ?? 0, embedded, failed, skippedDuplicates })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
