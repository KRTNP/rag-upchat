import { GoogleGenerativeAI } from "@google/generative-ai"
import { createClient } from "@supabase/supabase-js"

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export async function POST(req) {

  const { question } = await req.json()

  // 1️⃣ embed question
  const embedRes = await fetch("http://localhost:3000/api/embed", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: question })
  })

  const embedding = await embedRes.json()

  // 2️⃣ vector search ตรงจาก Supabase
  const { data: docs, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 3
  })

  if (error) {
    console.error("search error:", error)
  }

  console.log("docs:", docs)

  // 3️⃣ build context
  let context = ""

  if (docs && docs.length > 0) {
    context = docs
      .map(d => `${d.question} ${d.answer}`)
      .join("\n")
  }

  console.log("context:", context)

  // 4️⃣ call Gemini
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