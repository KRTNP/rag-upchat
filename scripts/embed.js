import dotenv from "dotenv";
import axios from "axios";
import { createClient } from "@supabase/supabase-js";

// โหลดไฟล์ .env.local
dotenv.config({ path: ".env.local" });

// ✅ เช็ค Supabase env
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase env");
  process.exit(1);
}

// ✅ เช็ค Cloudflare env
const cfAccountId = process.env.CF_ACCOUNT_ID;
const cfApiToken = process.env.CF_API_TOKEN;

if (!cfAccountId || !cfApiToken) {
  console.error("Missing Cloudflare env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  try {

    const { data, error } = await supabase
      .from("documents")
      .select("*");

    if (error) {
      console.error("Supabase fetch error:", error);
      return;
    }

    if (!data?.length) {
      console.log("No documents found");
      return;
    }

    for (const row of data) {

      const text = `${row.question} ${row.answer}`;

      try {

        const response = await axios.post(
          `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/baai/bge-m3`,
          {
            text: [text]
          },
          {
            headers: {
              Authorization: `Bearer ${cfApiToken}`,
              "Content-Type": "application/json"
            }
          }
        );

        const embedding = response.data.result.data[0];

        const { error: updateError } = await supabase
          .from("documents")
          .update({ embedding })
          .eq("id", row.id);

        if (updateError) {
          console.error("Update error:", updateError);
        } else {
          console.log("embedded:", row.id);
        }

      } catch (aiError) {
        console.error(
          "Cloudflare AI error:",
          aiError.response?.data || aiError.message
        );
      }

    }

  } catch (err) {
    console.error("Script error:", err);
  }
}

run();