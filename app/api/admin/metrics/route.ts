import { assertAdminRequest } from "@/app/lib/admin-auth"
import { getSupabaseAdminClient } from "@/app/lib/supabase-admin"

export async function GET(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const supabase = getSupabaseAdminClient()

    const [totalResult, embeddedResult, latestResult] = await Promise.all([
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase.from("documents").select("id", { count: "exact", head: true }).not("embedding", "is", null),
      supabase.from("documents").select("id").order("id", { ascending: false }).limit(1).maybeSingle()
    ])

    if (totalResult.error) {
      return Response.json({ error: totalResult.error.message }, { status: 500 })
    }

    if (embeddedResult.error) {
      return Response.json({ error: embeddedResult.error.message }, { status: 500 })
    }

    if (latestResult.error) {
      return Response.json({ error: latestResult.error.message }, { status: 500 })
    }

    const total = totalResult.count ?? 0
    const embedded = embeddedResult.count ?? 0
    const latestId = latestResult.data?.id ?? null

    return Response.json({
      totalDocuments: total,
      embeddedDocuments: embedded,
      pendingEmbeddings: total - embedded,
      latestDocumentId: latestId
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
