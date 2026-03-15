import { GoogleGenerativeAI } from "@google/generative-ai"
import { docToText } from "@/app/lib/document-text"
import { getEmbedding } from "@/app/lib/embedding"
import { checkProhibitedKeyword, isOutOfScopeQuestion, parseProhibitedKeywords } from "@/app/lib/guardrails"
import { checkRateLimit } from "@/app/lib/server-rate-limit"
import { getSupabaseClient } from "@/app/lib/supabase"

type MatchedDoc = {
  id?: number
  question?: string
  answer?: string
  content?: string
  similarity?: number
}

type ChatTurn = {
  role: "user" | "bot"
  text: string
}

async function generateWithModel(apiKey: string, modelName: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

async function generateWithZai(apiKey: string, modelName: string, prompt: string) {
  const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelName,
      stream: false,
      temperature: 0.7,
      messages: [{ role: "user", content: prompt }]
    })
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`Z.AI request failed: ${res.status} ${errBody}`.trim())
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }

  const answer = data.choices?.[0]?.message?.content?.trim()
  if (!answer) {
    throw new Error("Z.AI response missing content")
  }

  return answer
}

function isRateLimitError(error: unknown) {
  const status =
    typeof error === "object" && error !== null && "status" in error ? (error as { status?: unknown }).status : undefined

  if (status === 429) {
    return true
  }

  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase()
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota") ||
    message.includes("resource exhausted") ||
    message.includes("too many requests")
  )
}

export async function POST(req: Request) {
  const { question, history } = (await req.json()) as { question?: string; history?: ChatTurn[] }
  const userQuestion = (question ?? "").trim()

  if (!userQuestion) {
    return Response.json({ error: "Missing question", fallbackReason: "invalid-request" }, { status: 400 })
  }

  const clientIp = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rateLimitMax = Number(process.env.SERVER_RATE_LIMIT_MAX ?? 20)
  const rateLimitWindowMs = Number(process.env.SERVER_RATE_LIMIT_WINDOW_MS ?? 60_000)
  const limiter = checkRateLimit(`chat:${clientIp}`, rateLimitMax, rateLimitWindowMs)

  if (!limiter.allowed) {
    return Response.json(
      { error: "Too many requests", fallbackReason: "server-rate-limit", retryAfterSec: limiter.retryAfterSec },
      { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
    )
  }

  const prohibitedKeywords = parseProhibitedKeywords(process.env.PROHIBITED_KEYWORDS)
  const prohibitedCheck = checkProhibitedKeyword(userQuestion, prohibitedKeywords)
  if (prohibitedCheck.blocked) {
    return Response.json(
      { error: `Message blocked by policy (${prohibitedCheck.keyword})`, fallbackReason: "prohibited-keyword" },
      { status: 400 }
    )
  }

  const geminiApiKey = process.env.GEMINI_API_KEY
  const zaiApiKey = process.env.ZAI_API_KEY

  if (!geminiApiKey && !zaiApiKey) {
    return Response.json({ error: "Missing GEMINI_API_KEY and ZAI_API_KEY", fallbackReason: "missing-model-keys" }, { status: 500 })
  }

  let supabase
  try {
    supabase = getSupabaseClient()
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return Response.json({ error: message, fallbackReason: "supabase-init-failed" }, { status: 500 })
  }

  const embedding = await getEmbedding(userQuestion)

  const primary = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.7,
    match_count: 3
  })

  if (primary.error) {
    console.error("search error:", primary.error)
  }

  let docs = (primary.data ?? []) as MatchedDoc[]

  if (!docs.length) {
    const fallback = await supabase.rpc("match_documents", {
      query_embedding: embedding,
      match_threshold: 0,
      match_count: 3
    })

    if (fallback.error) {
      console.error("fallback search error:", fallback.error)
    } else {
      docs = (fallback.data ?? []) as MatchedDoc[]
    }
  }

  const maxSimilarity = Math.max(0, ...docs.map((doc) => doc.similarity ?? 0))
  if (isOutOfScopeQuestion(userQuestion, maxSimilarity)) {
    return Response.json({
      answer: "คำถามนี้อยู่นอกขอบเขตระบบนี้ครับ ระบบตอบได้เฉพาะเรื่อง กยศ / การกู้ยืม / ระเบียบที่เกี่ยวกับนิสิต และข้อมูลภายในที่อยู่ในฐานความรู้เท่านั้น",
      contextMatches: docs.length,
      fallbackUsed: true,
      fallbackReason: "out-of-scope",
      model: "guardrail-out-of-scope"
    })
  }

  const context = docs.map(docToText).filter(Boolean).join("\n")
  const recentHistory = (history ?? [])
    .slice(-12)
    .map((turn) => `${turn.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${turn.text}`)
    .join("\n")

  const prompt = `
คุณคือผู้ช่วย AI ที่คุยเหมือนแชทธรรมชาติ

กฎการตอบ
- ถ้าผู้ใช้ทักทาย ให้ตอบทักทาย
- ถ้าคำถามอยู่นอกขอบเขต กยศ/การกู้ยืม/งานนิสิต/ข้อมูลในคลังความรู้ ให้ตอบปฏิเสธสุภาพว่าอยู่นอกขอบเขต
- ถ้าถามเกี่ยวกับ กยศ ให้ใช้ข้อมูลด้านล่างเป็นหลัก และตอบให้ตรงข้อเท็จจริงที่สุด
- ถ้าในข้อมูลอ้างอิงมีคำตอบตรง ให้ตอบจากข้อมูลอ้างอิงก่อนเสมอ
- ถ้าข้อมูลอ้างอิงมีหลายกรณี (เช่น หลายภาค/หลายประเภท) ให้สรุปทุกกรณีแบบเป็นรายการในคำตอบเดียว ห้ามถามกลับก่อน

ข้อมูลอ้างอิง:
${context || "ไม่มีข้อมูลอ้างอิงที่ match ได้"}

บริบทบทสนทนาก่อนหน้า:
${recentHistory || "ไม่มี"}

คำถามผู้ใช้:
${userQuestion}

ตอบให้เหมือนกำลังคุยแชทกับเพื่อน
`

  const errors: unknown[] = []
  let geminiFailed = false
  let geminiSawRateLimit = false

  if (geminiApiKey) {
    const geminiModels = ["gemini-2.5-flash", "gemini-1.5-flash"] as const

    for (const model of geminiModels) {
      try {
        const answer = await generateWithModel(geminiApiKey, model, prompt)
        return Response.json({ answer, contextMatches: docs.length, fallbackUsed: false, fallbackReason: "none", model })
      } catch (err) {
        geminiFailed = true
        geminiSawRateLimit = geminiSawRateLimit || isRateLimitError(err)
        errors.push(err)
        console.error(`model attempt failed: gemini/${model}`, err)
      }
    }
  }

  const shouldUseZaiFallback = Boolean(zaiApiKey && geminiApiKey && geminiFailed && geminiSawRateLimit)
  const shouldUseZaiPrimary = Boolean(zaiApiKey && !geminiApiKey)

  if ((shouldUseZaiFallback || shouldUseZaiPrimary) && zaiApiKey) {
    try {
      const answer = await generateWithZai(zaiApiKey, "glm-4.7-flash", prompt)
      const fallbackReason = shouldUseZaiPrimary ? "zai-primary" : "gemini-rate-limit"
      return Response.json({ answer, contextMatches: docs.length, fallbackUsed: Boolean(geminiApiKey), fallbackReason, model: "glm-4.7-flash" })
    } catch (err) {
      errors.push(err)
      console.error("model attempt failed: zai/glm-4.7-flash", err)
    }
  }

  const fallbackItems = docs.map((doc) => docToText(doc)).filter(Boolean).slice(0, 3)
  const quotaLikeFailure = geminiApiKey ? geminiFailed && geminiSawRateLimit : false
  const fallbackPrefix = quotaLikeFailure ? "ตอนนี้โควต้า AI เต็มชั่วคราว" : "ตอนนี้ระบบ AI หลักขัดข้องชั่วคราว"
  const fallbackAnswer = fallbackItems.length
    ? `${fallbackPrefix} แต่เจอข้อมูลอ้างอิงที่เกี่ยวข้อง:\n- ${fallbackItems.join("\n- ")}`
    : `${fallbackPrefix} และยังไม่พบข้อมูลอ้างอิงที่ตรงคำถาม`

  if (errors.length > 0) {
    console.error("all model attempts failed", errors)
  }

  const finalFallbackReason = quotaLikeFailure ? "all-models-failed-after-rate-limit" : "all-models-failed-non-rate-limit"
  return Response.json({
    answer: fallbackAnswer,
    contextMatches: docs.length,
    fallbackUsed: true,
    fallbackReason: finalFallbackReason,
    model: "context-fallback"
  })
}
