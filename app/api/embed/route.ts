import { getEmbedding } from "@/app/lib/embedding"

export async function POST(req: Request) {
  try {
    const { text } = await req.json()
    const embedding = await getEmbedding(text)

    return Response.json(embedding)
  } catch (err) {
    console.error(err)
    return Response.json({ error: "server error" })
  }
}
