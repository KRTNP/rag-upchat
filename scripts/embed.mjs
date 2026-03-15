import dotenv from "dotenv"
import axios from "axios"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim()
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "").trim()

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")
  process.exit(1)
}

const cfAccountId = (process.env.CF_ACCOUNT_ID ?? "").trim()
const cfApiToken = (process.env.CF_API_TOKEN ?? "").trim()

if (!cfAccountId || !cfApiToken) {
  console.error("Missing CF_ACCOUNT_ID or CF_API_TOKEN")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

function rowToText(row) {
  const content = typeof row.content === "string" ? row.content.trim() : ""
  if (content) return content

  const question = typeof row.question === "string" ? row.question.trim() : ""
  const answer = typeof row.answer === "string" ? row.answer.trim() : ""
  return `${question} ${answer}`.trim()
}

async function loadDocuments() {
  const byContent = await supabase.from("documents").select("id,content")
  if (!byContent.error) {
    return byContent.data ?? []
  }

  const byQA = await supabase.from("documents").select("id,question,answer")
  if (!byQA.error) {
    return byQA.data ?? []
  }

  throw new Error(byQA.error?.message ?? byContent.error?.message ?? "Unable to load documents")
}

async function run() {
  try {
    const data = await loadDocuments()

    if (!data.length) {
      console.log("No documents found")
      return
    }

    let success = 0
    let failed = 0
    let skipped = 0

    for (const row of data) {
      const text = rowToText(row)

      if (!text) {
        skipped += 1
        continue
      }

      try {
        const response = await axios.post(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-m3`,
          { text: [text] },
          {
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
              "Content-Type": "application/json"
            }
          }
        )

        const embedding = response.data?.result?.data?.[0]

        if (!embedding) {
          throw new Error("Missing embedding in Cloudflare response")
        }

        const { error: updateError } = await supabase.from("documents").update({ embedding }).eq("id", row.id)

        if (updateError) {
          throw new Error(updateError.message)
        }

        success += 1
      } catch (error) {
        failed += 1
        const message = axios.isAxiosError(error) ? JSON.stringify(error.response?.data ?? error.message) : String(error)
        console.error(`embed failed for ${row.id}:`, message)
      }
    }

    console.log(`done. success=${success} failed=${failed} skipped=${skipped}`)
  } catch (error) {
    console.error("Script error:", error)
    process.exit(1)
  }
}

run()
