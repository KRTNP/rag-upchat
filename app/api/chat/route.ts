import { GoogleGenerativeAI } from "@google/generative-ai"
import { getSupabaseClient } from "@/app/lib/supabase"
import { getEmbedding } from "@/app/lib/embedding"

type MatchedDoc = {
  question: string
  answer: string
}

export async function POST(req: Request) {
  const { question } = await req.json()

  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 })
  }

  let supabase
  try {
    supabase = getSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }

  const embedding = await getEmbedding(question)

  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 3
  })

  if (error) {
    console.error("search error:", error)
  }

  const docs = (data ?? []) as MatchedDoc[]
  const context = docs.map(d => `${d.question} ${d.answer}`).join("\n")

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
  })

  const prompt = `
คุณคือผู้ช่วย AI ที่คุยเหมือนแชทธรรมชาติ

กฎการตอบ
- ถ้าผู้ใช้ทักทาย ให้ตอบทักทาย
- ถ้าถามเรื่องทั่วไป ให้ตอบเหมือนแชท
- ถ้าถามเกี่ยวกับ กยศ ให้ใช้ข้อมูลด้านล่าง

ข้อมูลอ้างอิง:
${context}

คำถามผู้ใช้:
${question}

ตอบให้เหมือนกำลังคุยแชทกับเพื่อน
`

  const result = await model.generateContent(prompt)
  const answer = result.response.text()

  return Response.json({ answer })
}
