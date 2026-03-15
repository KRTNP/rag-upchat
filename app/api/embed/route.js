export async function POST(req) {
  try {

    const { text } = await req.json()

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/@cf/baai/bge-m3`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.CF_API_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: [text]
        })
      }
    )

    const result = await response.json()

    // debug ดูก่อน
    console.log(result)

    const embedding = result?.result?.data?.[0]

    if (!embedding) {
      return Response.json({ error: "embedding failed", result })
    }
    console.log("embedding:", embedding)

    return Response.json(embedding)

  } catch (err) {
    console.error(err)
    return Response.json({ error: "server error" })
  }
}