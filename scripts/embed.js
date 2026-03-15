import dotenv from "dotenv"
import axios from "axios"
import { createClient } from "@supabase/supabase-js"

dotenv.config({ path: ".env.local" })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY")
  process.exit(1)
}

const cfAccountId = process.env.CF_ACCOUNT_ID
const cfApiToken = process.env.CF_API_TOKEN

if (!cfAccountId || !cfApiToken) {
  console.error("Missing CF_ACCOUNT_ID or CF_API_TOKEN")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function run() {
  try {
    const { data, error } = await supabase.from("documents").select("id,question,answer")

    if (error) {
      console.error("Supabase fetch error:", error.message)
      process.exit(1)
    }

    if (!data?.length) {
      console.log("No documents found")
      return
    }

    let success = 0
    let failed = 0

    for (const row of data) {
      const text = `${row.question} ${row.answer}`

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
        console.log(`embedded: ${row.id}`)
      } catch (error) {
        failed += 1
        const message = axios.isAxiosError(error) ? JSON.stringify(error.response?.data ?? error.message) : String(error)
        console.error(`embed failed for ${row.id}:`, message)
      }
    }

    console.log(`done. success=${success} failed=${failed}`)
  } catch (error) {
    console.error("Script error:", error)
    process.exit(1)
  }
}

run()
