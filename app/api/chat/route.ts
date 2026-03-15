import { GoogleGenerativeAI } from "@google/generative-ai"
import { createHash } from "crypto"
import { docToText } from "@/app/lib/document-text"
import { getEmbedding } from "@/app/lib/embedding"
import { checkProhibitedKeyword, isOutOfScopeQuestion, parseProhibitedKeywords } from "@/app/lib/guardrails"
import { ResponseCache } from "@/app/lib/response-cache"
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
type AnswerMode = "strict" | "chat"

type ChatApiSuccessPayload = {
  answer: string
  contextMatches: number
  fallbackUsed: boolean
  fallbackReason: string
  model: string
}

const chatResponseCache = new ResponseCache<ChatApiSuccessPayload>()

function buildCacheKey(question: string, history: ChatTurn[]) {
  const compactHistory = history.slice(-4).map((turn) => `${turn.role}:${turn.text}`).join("|")
  return createHash("sha1").update(`${question.trim().toLowerCase()}::${compactHistory}`).digest("hex")
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function generateWithModel(apiKey: string, modelName: string, prompt: string) {
  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: modelName, generationConfig: { temperature: 0.2 } })
  const result = await model.generateContent(prompt)
  return result.response.text()
}

async function generateWithZai(apiKey: string, modelName: string, prompt: string, timeoutOverrideMs?: number) {
  const baseTimeoutMs = Number(process.env.MODEL_TIMEOUT_MS ?? 6000)
  const timeoutMs = timeoutOverrideMs ?? Math.max(baseTimeoutMs * 2, 10_000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  const res = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: modelName,
      stream: false,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }]
    }),
    signal: controller.signal
  })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(`zai/${modelName} timeout after ${timeoutMs}ms`)
      }
      throw error
    })
    .finally(() => {
      clearTimeout(timer)
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

function extractAnswerFromContent(content: string | undefined) {
  if (!content) return ""
  const marker = "คำตอบ:"
  const idx = content.indexOf(marker)
  if (idx === -1) return ""
  return content.slice(idx + marker.length).trim()
}

function extractQuestionFromContent(content: string | undefined) {
  if (!content) return ""
  const q = content.split("คำตอบ:")[0] ?? ""
  return q.replace("คำถาม:", "").trim()
}

function uniqueTokens(text: string) {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^\p{L}\p{N}\-]+/u)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2)
    )
  )
}

function lexicalOverlapScore(a: string, b: string) {
  const aTokens = uniqueTokens(a)
  const bSet = new Set(uniqueTokens(b))
  if (!aTokens.length || !bSet.size) return 0
  let hit = 0
  for (const token of aTokens) {
    if (bSet.has(token)) hit += 1
  }
  return hit / aTokens.length
}

type QueryConstraints = {
  upCode?: string
  grade?: string
  programHint?: string
}

function extractQueryConstraints(question: string): QueryConstraints {
  const text = question.toLowerCase()
  const upMatch = question.match(/\bup\s*\.?\s*(\d+(?:\.\d+)?)\b/i)
  const gradeMatch = question.match(/ชั้นปี\s*\d(?:\s*-\s*\d)?/i)

  const programHints = [
    "ปริญญาตรีควบ",
    "แพทย์แผนจีน",
    "ปริญญาตรี ปกติ",
    "โครงการพิเศษ",
    "บัณฑิตศึกษา",
    "แพทยศาสตรบัณฑิต",
    "ชั้นปี 3",
    "ชั้นปี 4-6"
  ]
  const programHint = programHints.find((hint) => text.includes(hint.toLowerCase()))

  return {
    upCode: upMatch ? upMatch[1] : undefined,
    grade: gradeMatch ? gradeMatch[0].replace(/\s+/g, " ").trim() : undefined,
    programHint
  }
}

function matchesConstraints(content: string | undefined, constraints: QueryConstraints) {
  const source = (content ?? "").toLowerCase()
  if (!source) return false

  if (constraints.upCode) {
    const normalized = source.replace(/\s+/g, "")
    const upNeedle = `up${constraints.upCode.replace(/\s+/g, "").toLowerCase()}`
    if (!normalized.includes(upNeedle)) {
      return false
    }
  }

  if (constraints.grade && !source.includes(constraints.grade.toLowerCase())) {
    return false
  }

  if (constraints.programHint && !source.includes(constraints.programHint.toLowerCase())) {
    return false
  }

  return true
}

function parseGeminiModelChain() {
  const raw = process.env.GEMINI_MODEL_CHAIN?.trim()
  if (!raw) {
    return ["gemini-2.5-flash", "gemma-3-27b-it"] as const
  }

  const chain = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)

  return (chain.length ? chain : ["gemini-2.5-flash", "gemma-3-27b-it"]) as readonly string[]
}

export async function POST(req: Request) {
  const { question, history, mode } = (await req.json()) as { question?: string; history?: ChatTurn[]; mode?: AnswerMode }
  const userQuestion = (question ?? "").trim()
  const safeHistory = history ?? []
  const chatScope = req.headers.get("x-chat-scope") === "user" ? "user" : "guest"
  const answerMode: AnswerMode = mode === "chat" ? "chat" : "strict"

  if (!userQuestion) {
    return Response.json({ error: "Missing question", fallbackReason: "invalid-request" }, { status: 400 })
  }

  const cacheTtlMs = Number(process.env.CHAT_RESPONSE_CACHE_TTL_MS ?? 60_000)
  const cacheKey = buildCacheKey(userQuestion, safeHistory)
  const cacheEnabled = chatScope === "guest"
  if (cacheEnabled) {
    const cached = chatResponseCache.get(cacheKey)
    if (cached) {
      return Response.json({ ...cached, cacheHit: true })
    }
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
  const enableOutOfScopeGuardrail = process.env.ENABLE_OUT_OF_SCOPE_GUARDRAIL === "true"

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
    match_threshold: 0.68,
    match_count: 3
  })

  if (primary.error) {
    console.error("search error:", primary.error)
  }

  const docs = (primary.data ?? []) as MatchedDoc[]
  const constraints = extractQueryConstraints(userQuestion)
  const constrainedDocs = docs.filter((doc) => matchesConstraints(doc.content, constraints))
  const docsForRanking = constrainedDocs.length > 0 ? constrainedDocs : docs
  const sortedDocs = [...docsForRanking].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
  const topDoc = sortedDocs[0]
  const secondDoc = sortedDocs[1]
  const topSimilarity = topDoc?.similarity ?? 0
  const directAnswerThreshold = Number(process.env.RAG_DIRECT_ANSWER_SIMILARITY ?? 0.75)
  const directAnswer = extractAnswerFromContent(topDoc?.content)
  const lockedAnswerThreshold = Number(process.env.RAG_LOCK_ANSWER_SIMILARITY ?? 0.65)
  const lexicalMin = Number(process.env.RAG_LOCK_LEXICAL_MIN ?? 0.25)
  const similarityGapMin = Number(process.env.RAG_LOCK_GAP_MIN ?? 0.04)
  const topQuestionText = extractQuestionFromContent(topDoc?.content)
  const lexicalScore = lexicalOverlapScore(userQuestion, topQuestionText)
  const similarityGap = (topDoc?.similarity ?? 0) - (secondDoc?.similarity ?? 0)
  const canLockAnswer = Boolean(
    directAnswer &&
      topSimilarity >= lockedAnswerThreshold &&
      lexicalScore >= lexicalMin &&
      (sortedDocs.length === 1 || similarityGap >= similarityGapMin)
  )

  if (answerMode === "strict" && topDoc && topSimilarity >= directAnswerThreshold && directAnswer && canLockAnswer) {
    const payload: ChatApiSuccessPayload = {
      answer: directAnswer,
      contextMatches: docs.length,
      fallbackUsed: false,
      fallbackReason: "direct-rag-answer",
      model: "retrieval-direct"
    }
    if (cacheEnabled) {
      chatResponseCache.set(cacheKey, payload, cacheTtlMs)
    }
    return Response.json({ ...payload, cacheHit: false })
  }

  const maxSimilarity = Math.max(0, ...docs.map((doc) => doc.similarity ?? 0))
  if (enableOutOfScopeGuardrail && isOutOfScopeQuestion(userQuestion, maxSimilarity)) {
    return Response.json({
      answer: "คำถามนี้อยู่นอกขอบเขตระบบนี้ครับ ระบบตอบได้เฉพาะเรื่อง กยศ / การกู้ยืม / ระเบียบที่เกี่ยวกับนิสิต และข้อมูลภายในที่อยู่ในฐานความรู้เท่านั้น",
      contextMatches: docs.length,
      fallbackUsed: true,
      fallbackReason: "out-of-scope",
      model: "guardrail-out-of-scope"
    })
  }

  const outOfScopeRule = enableOutOfScopeGuardrail
    ? "- ถ้าคำถามอยู่นอกขอบเขต กยศ/การกู้ยืม/งานนิสิต/ข้อมูลในคลังความรู้ ให้ตอบปฏิเสธสุภาพว่าอยู่นอกขอบเขต"
    : ""

  const context = docsForRanking.map(docToText).filter(Boolean).join("\n")
  const recentHistory = safeHistory
    .slice(-6)
    .map((turn) => `${turn.role === "user" ? "ผู้ใช้" : "ผู้ช่วย"}: ${turn.text}`)
    .join("\n")

  const prompt = `
คุณคือผู้ช่วย AI ที่คุยเหมือนแชทธรรมชาติ

กฎการตอบ
- ถ้าผู้ใช้ทักทาย ให้ตอบทักทาย
${outOfScopeRule}
- ถ้าถามเกี่ยวกับ กยศ ให้ใช้ข้อมูลด้านล่างเป็นหลัก และตอบให้ตรงข้อเท็จจริงที่สุด
- ถ้าในข้อมูลอ้างอิงมีคำตอบตรง ให้ตอบจากข้อมูลอ้างอิงก่อนเสมอ และห้ามแต่งข้อมูลเพิ่ม
- ถ้ามีคำตอบอยู่ในข้อมูลอ้างอิง ให้ตอบเฉพาะเนื้อคำตอบสั้นๆ โดยไม่ต้องทักทาย/ไม่ต้องเกริ่น
- ถ้าข้อมูลอ้างอิงมีหลายกรณี (เช่น หลายภาค/หลายประเภท) ให้สรุปทุกกรณีแบบเป็นรายการในคำตอบเดียว ห้ามถามกลับก่อน
- โหมดคำตอบตอนนี้คือ: ${answerMode} (strict = ตอบสั้นตรงข้อมูล, chat = อธิบายเพิ่มได้)

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
  const geminiTimeoutMs = Number(process.env.MODEL_TIMEOUT_MS ?? 6000)

  if (geminiApiKey) {
    const geminiModels = parseGeminiModelChain()

    for (const model of geminiModels) {
      try {
        const answer = await withTimeout(generateWithModel(geminiApiKey, model, prompt), geminiTimeoutMs, `gemini/${model}`)
        const finalAnswer = answerMode === "strict" && canLockAnswer ? directAnswer : answer
        const payload: ChatApiSuccessPayload = {
          answer: finalAnswer,
          contextMatches: docs.length,
          fallbackUsed: false,
          fallbackReason: answerMode === "strict" && canLockAnswer ? "locked-rag-answer" : "none",
          model
        }
        if (cacheEnabled) {
          chatResponseCache.set(cacheKey, payload, cacheTtlMs)
        }
        return Response.json({ ...payload, cacheHit: false })
      } catch (err) {
        geminiFailed = true
        geminiSawRateLimit = geminiSawRateLimit || isRateLimitError(err)
        errors.push(err)
        console.error(`model attempt failed: gemini/${model}`, err)
      }
    }
  }

  const shouldUseZaiFallback = Boolean(zaiApiKey && geminiApiKey && geminiFailed)
  const shouldUseZaiPrimary = Boolean(zaiApiKey && !geminiApiKey)

  if ((shouldUseZaiFallback || shouldUseZaiPrimary) && zaiApiKey) {
    try {
      // Give z.ai full timeout budget from config, independent of Gemini elapsed time.
      const answer = await generateWithZai(zaiApiKey, "glm-4.7-flash", prompt)
      const finalAnswer = answerMode === "strict" && canLockAnswer ? directAnswer : answer
      const fallbackReason = shouldUseZaiPrimary ? "zai-primary" : "gemini-failed"
      const payload: ChatApiSuccessPayload = {
        answer: finalAnswer,
        contextMatches: docs.length,
        fallbackUsed: Boolean(geminiApiKey),
        fallbackReason: answerMode === "strict" && canLockAnswer ? "locked-rag-answer" : fallbackReason,
        model: "glm-4.7-flash"
      }
      if (cacheEnabled) {
        chatResponseCache.set(cacheKey, payload, cacheTtlMs)
      }
      return Response.json({ ...payload, cacheHit: false })
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

  const finalFallbackReason = quotaLikeFailure ? "all-models-failed-after-rate-limit" : "all-models-failed"
  const fallbackPayload: ChatApiSuccessPayload = {
    answer: fallbackAnswer,
    contextMatches: docs.length,
    fallbackUsed: true,
    fallbackReason: finalFallbackReason,
    model: "context-fallback"
  }
  // Avoid caching context-only fallback to reduce stale/low-quality repeats.
  return Response.json({ ...fallbackPayload, cacheHit: false })
}
