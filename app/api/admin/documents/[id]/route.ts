import { assertAdminRequest } from "@/app/lib/admin-auth"
import { combineDocumentText } from "@/app/lib/document-admin"
import { getEmbedding } from "@/app/lib/embedding"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

type Params = {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, { params }: Params) {
  if (!assertAdminRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const body = (await req.json()) as { question?: string; answer?: string; embedNow?: boolean }
    const question = body.question?.trim()
    const answer = body.answer?.trim()

    if (!question || !answer) {
      return Response.json({ error: "question and answer are required" }, { status: 400 })
    }

    const supabase = getSupabaseAdminClient()
    const { data, error } = await supabase
      .from("documents")
      .update({ question, answer })
      .eq("id", Number(id))
      .select("id,question,answer")
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (body.embedNow ?? true) {
      const embedding = await getEmbedding(combineDocumentText(question, answer))
      const { error: embedError } = await supabase.from("documents").update({ embedding }).eq("id", Number(id))
      if (embedError) {
        return Response.json({ error: `Updated but embed failed: ${embedError.message}` }, { status: 500 })
      }
    }

    return Response.json({ item: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: Params) {
  if (!assertAdminRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from("documents").delete().eq("id", Number(id))

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
