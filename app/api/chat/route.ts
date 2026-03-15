import { GoogleGenerativeAI } from "@google/generative-ai"
import { createHash } from "crypto"
import { docToText } from "@/app/lib/document-text"
import { getEmbedding } from "@/app/lib/embedding"
import { checkProhibitedKeyword, isOutOfScopeQuestion, parseProhibitedKeywords } from "@/app/lib/guardrails"
import { ResponseCache } from "@/app/lib/response-cache"
import { getCooldownRemainingSec, setCooldownSec } from "@/app/lib/shared-runtime-state"
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

function parseRetryAfterSeconds(error: unknown) {
  const text = error instanceof Error ? error.message : String(error ?? "")
  const matchSec = text.match(/retry in\s+([\d.]+)\s*s/i)
  if (matchSec?.[1]) {
    return Math.max(1, Math.ceil(Number(matchSec[1])))
  }

  const matchDelay = text.match(/"retryDelay"\s*:\s*"(\d+)s"/i)
  if (matchDelay?.[1]) {
    return Math.max(1, Number(matchDelay[1]))
  }

  return null
}

function shouldCooldownZai(error: unknown) {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase()
  return message.includes("timeout") || message.includes("429") || message.includes("rate limit") || message.includes("unavailable")
}

function extractAnswerFromContent(content: string | undefined) {
  if (!content) return ""
  const marker = "คำตอบ:"
  const idx = content.indexOf(marker)
  if (idx === -1) return ""
  return content.slice(idx + marker.length).trim()
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
  const { question, history } = (await req.json()) as { question?: string; history?: ChatTurn[] }
  const userQuestion = (question ?? "").trim()
  const safeHistory = history ?? []
  const chatScope = req.headers.get("x-chat-scope") === "user" ? "user" : "guest"

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

  const clientIp = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const rateLimitMax = Number(process.env.SERVER_RATE_LIMIT_MAX ?? 20)
  const rateLimitWindowMs = Number(process.env.SERVER_RATE_LIMIT_WINDOW_MS ?? 60_000)
  const enableServerRateLimit = process.env.ENABLE_SERVER_RATE_LIMIT === "true"

  if (enableServerRateLimit) {
    const limiter = await checkRateLimit(`chat:${clientIp}`, rateLimitMax, rateLimitWindowMs)
    if (!limiter.allowed) {
      return Response.json(
        { error: "Too many requests", fallbackReason: "server-rate-limit", retryAfterSec: limiter.retryAfterSec },
        { status: 429, headers: { "Retry-After": String(limiter.retryAfterSec) } }
      )
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
  const topDoc = [...docs].sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))[0]
  const topSimilarity = topDoc?.similarity ?? 0
  const directAnswerThreshold = Number(process.env.RAG_DIRECT_ANSWER_SIMILARITY ?? 0.86)
  const directAnswer = extractAnswerFromContent(topDoc?.content)

  if (topDoc && topSimilarity >= directAnswerThreshold && directAnswer) {
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

  const context = docs.map(docToText).filter(Boolean).join("\n")
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
- ถ้าข้อมูลอ้างอิงมีหลายกรณี (เช่น หลายภาค/หลายประเภท) ให้สรุปทุกกรณีแบบเป็นรายการในคำตอบเดียว ห้ามถามกลับก่อน

ข้อมูลอ้างอิง:
${context || "ไม่มีข้อมูลอ้างอิงที่ match ได้"}

บริบทบทสนทนาก่อนหน้า:
${recentHistory || "ไม่มี"}

คำถามผู้ใช้:
${userQuestion}

ตอบให้เหมือนกำลังคุยแชทกับเพื่อน
`

  const preGeminiCooldownSec = geminiApiKey ? await getCooldownRemainingSec("cooldown:gemini") : 0
  const preZaiCooldownSec = zaiApiKey ? await getCooldownRemainingSec("cooldown:zai") : 0
  if ((geminiApiKey ? preGeminiCooldownSec > 0 : true) && (zaiApiKey ? preZaiCooldownSec > 0 : true)) {
    const fallbackItems = docs.map((doc) => docToText(doc)).filter(Boolean).slice(0, 3)
    const fallbackAnswer = fallbackItems.length
      ? `ระบบ AI ติดโควต้าชั่วคราวทั้งสองช่องทาง กรุณารอสักครู่ แต่มีข้อมูลอ้างอิงที่เกี่ยวข้อง:\n- ${fallbackItems.join("\n- ")}`
      : "ระบบ AI ติดโควต้าชั่วคราวทั้งสองช่องทาง กรุณารอสักครู่ แล้วลองใหม่อีกครั้ง"

    const payload: ChatApiSuccessPayload = {
      answer: fallbackAnswer,
      contextMatches: docs.length,
      fallbackUsed: true,
      fallbackReason: "providers-in-cooldown",
      model: "context-fallback"
    }
    return Response.json({ ...payload, cacheHit: false })
  }

  const errors: unknown[] = []
  let geminiFailed = false
  let geminiSawRateLimit = false
  let geminiRetryAfterSec: number | null = null
  const geminiTimeoutMs = Number(process.env.MODEL_TIMEOUT_MS ?? 6000)

  if (geminiApiKey) {
    const geminiCooldownSec = preGeminiCooldownSec
    if (geminiCooldownSec > 0) {
      geminiFailed = true
      geminiSawRateLimit = true
      errors.push(new Error(`gemini cooldown active for ${geminiCooldownSec}s`))
    } else {
      const geminiModels = parseGeminiModelChain()

      for (const model of geminiModels) {
        try {
          const answer = await withTimeout(generateWithModel(geminiApiKey, model, prompt), geminiTimeoutMs, `gemini/${model}`)
          const payload: ChatApiSuccessPayload = { answer, contextMatches: docs.length, fallbackUsed: false, fallbackReason: "none", model }
          if (cacheEnabled) {
            chatResponseCache.set(cacheKey, payload, cacheTtlMs)
          }
          return Response.json({ ...payload, cacheHit: false })
        } catch (err) {
          geminiFailed = true
          const rateLimited = isRateLimitError(err)
          geminiSawRateLimit = geminiSawRateLimit || rateLimited
          if (rateLimited) {
            const retryAfterSec = parseRetryAfterSeconds(err) ?? 30
            geminiRetryAfterSec = retryAfterSec
            await setCooldownSec("cooldown:gemini", retryAfterSec)
          }
          errors.push(err)
          console.error(`model attempt failed: gemini/${model}`, err)
        }
      }
    }
  }

  const shortRetryRateLimit = Boolean(geminiRetryAfterSec !== null && geminiRetryAfterSec <= 3)
  const shouldUseZaiFallback = Boolean(zaiApiKey && geminiApiKey && geminiFailed && geminiSawRateLimit && !shortRetryRateLimit)
  const shouldUseZaiPrimary = Boolean(zaiApiKey && !geminiApiKey)

  if ((shouldUseZaiFallback || shouldUseZaiPrimary) && zaiApiKey) {
    const zaiCooldownSec = preZaiCooldownSec
    if (zaiCooldownSec > 0) {
      errors.push(new Error(`zai cooldown active for ${zaiCooldownSec}s`))
    } else {
      try {
        // Give z.ai full timeout budget from config, independent of Gemini elapsed time.
        const answer = await generateWithZai(zaiApiKey, "glm-4.7-flash", prompt)
        const fallbackReason = shouldUseZaiPrimary ? "zai-primary" : "gemini-rate-limit"
        const payload: ChatApiSuccessPayload = {
          answer,
          contextMatches: docs.length,
          fallbackUsed: Boolean(geminiApiKey),
          fallbackReason,
          model: "glm-4.7-flash"
        }
        if (cacheEnabled) {
          chatResponseCache.set(cacheKey, payload, cacheTtlMs)
        }
        return Response.json({ ...payload, cacheHit: false })
      } catch (err) {
        if (shouldCooldownZai(err)) {
          const cooldownSec = parseRetryAfterSeconds(err) ?? 45
          await setCooldownSec("cooldown:zai", Math.max(5, cooldownSec))
        }
        errors.push(err)
        console.error("model attempt failed: zai/glm-4.7-flash", err)
      }
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

  const finalFallbackReason = shortRetryRateLimit
    ? "gemini-rate-limit-short-retry"
    : quotaLikeFailure
      ? "all-models-failed-after-rate-limit"
      : "all-models-failed-non-rate-limit"
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
