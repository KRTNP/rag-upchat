"use client"
import { useState } from "react"

export default function Page() {

  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<any[]>([])

  async function ask() {

    if (!question.trim()) return

    const userMsg = { role: "user", text: question }
    setMessages(prev => [...prev, userMsg])

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ question })
    })

    const data = await res.json()

    const botMsg = { role: "bot", text: data.answer }

    setMessages(prev => [...prev, botMsg])
    setQuestion("")
  }

  return (
    <div style={{ padding: 40 }}>

      <h1>RAG Chat</h1>

      <div style={{ marginBottom: 20 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            marginBottom: 10,
            textAlign: m.role === "user" ? "right" : "left"
          }}>
            <span style={{
              background: m.role === "user" ? "#4f46e5" : "#333",
              color: "white",
              padding: "8px 12px",
              borderRadius: 8,
              display: "inline-block"
            }}>
              {m.text}
            </span>
          </div>
        ))}
      </div>

      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="ถามคำถาม..."
        style={{ padding: 8, width: "70%" }}
      />

      <button
        onClick={ask}
        style={{ padding: 8, marginLeft: 10 }}
      >
        ถาม
      </button>

    </div>
  )
}