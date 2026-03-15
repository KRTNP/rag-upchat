export async function getEmbedding(text: string) {
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
  const embedding = result?.result?.data?.[0]

  if (!embedding) {
    throw new Error(`Embedding failed: ${JSON.stringify(result)}`)
  }

  return embedding
}
