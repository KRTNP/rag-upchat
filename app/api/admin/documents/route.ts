import { assertAdminRequest } from "@/app/lib/admin-auth"
import { combineDocumentText, splitDocumentText } from "@/app/lib/document-admin"
import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

function isDuplicateDocumentPkError(message: string) {
  const text = message.toLowerCase()
  return text.includes("documents_pkey") || text.includes("duplicate key value")
}

export async function GET(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const search = (url.searchParams.get("search") ?? "").trim()
  const page = Math.max(Number(url.searchParams.get("page") ?? "1") || 1, 1)
  const pageSize = Math.min(Math.max(Number(url.searchParams.get("pageSize") ?? "20") || 20, 1), 100)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  try {
    const supabase = getSupabaseAdminClient()
    let query = supabase.from("documents").select("id,content", { count: "exact" }).order("id", { ascending: false })

    if (search) {
      query = query.ilike("content", `%${search}%`)
    }

    const { data, error, count } = await query.range(from, to)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    const items = (data ?? []).map((row: { id: number; content: string }) => ({
      id: row.id,
      content: row.content,
      ...splitDocumentText(row.content)
    }))

    return Response.json({ items, total: count ?? 0, page, pageSize })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = (await req.json()) as { question?: string; answer?: string; content?: string; embedNow?: boolean }
    const question = body.question?.trim() ?? ""
    const answer = body.answer?.trim() ?? ""
    const content = (body.content?.trim() || combineDocumentText(question, answer)).trim()
    const embedNow = body.embedNow ?? true

    if (!content) {
      return Response.json({ error: "content is required" }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    let { data, error } = await supabase.from("documents").insert({ content }).select("id,content").single()

    if (error && isDuplicateDocumentPkError(error.message)) {
      const last = await supabase.from("documents").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
      if (last.error) {
        return Response.json({ error: last.error.message }, { status: 500 })
      }

      const nextId = ((last.data as { id?: number } | null)?.id ?? 0) + 1
      const retry = await supabase.from("documents").insert({ id: nextId, content }).select("id,content").single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) {
      return Response.json({ error: error?.message ?? "Insert failed" }, { status: 500 })
    }

    if (embedNow && data) {
      const embedding = await getEmbedding(data.content)
      const { error: embedError } = await supabase.from("documents").update({ embedding }).eq("id", data.id)
      if (embedError) {
        return Response.json({ error: `Saved but embed failed: ${embedError.message}`, item: data }, { status: 500 })
      }
    }

    return Response.json({ item: { ...data, ...splitDocumentText(data.content) } }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
