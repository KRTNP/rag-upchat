import { assertAdminRequest } from "@/app/lib/admin-auth"
import { reembedAllDocuments } from "@/app/lib/document-admin"

export async function POST(req: Request) {
  if (!(await assertAdminRequest(req))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await reembedAllDocuments()
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
