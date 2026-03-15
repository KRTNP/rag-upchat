import { assertAdminRequest } from "@/app/lib/admin-auth"
import { reembedDocumentById } from "@/app/lib/document-admin"

type Params = {
  params: Promise<{ id: string }>
}

export async function POST(req: Request, { params }: Params) {
  if (!assertAdminRequest(req)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { id } = await params
    const result = await reembedDocumentById(Number(id))
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
