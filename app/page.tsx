"use client"

import { useEffect, useState } from "react"
import ChatComposer from "@/app/components/chat-composer"
import ChatShell from "@/app/components/chat-shell"
import ChatStatus from "@/app/components/chat-status"
import MessageList from "@/app/components/message-list"
import { loadMessagesFromStorage, saveMessagesToStorage } from "@/app/lib/chat-storage"
import type { ChatMessage } from "@/app/lib/chat-types"

const ERROR_MESSAGE = "Unable to get a response. Please try again."

function makeMessage(role: ChatMessage["role"], text: string): ChatMessage {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt: new Date().toISOString()
  }
}

export default function Page() {
  const [question, setQuestion] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastQuestion, setLastQuestion] = useState("")
  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    setMessages(loadMessagesFromStorage())
    setStorageReady(true)
  }, [])

  useEffect(() => {
    if (!storageReady) {
      return
    }

    saveMessagesToStorage(messages)
  }, [messages, storageReady])

  async function ask(nextQuestion?: string) {
    const prompt = (nextQuestion ?? question).trim()

    if (!prompt || isLoading) {
      return
    }

    const fromRetry = Boolean(nextQuestion)
    setError(null)
    setIsLoading(true)
    setLastQuestion(prompt)

    if (!fromRetry) {
      setMessages((prev) => [...prev, makeMessage("user", prompt)])
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ question: prompt })
      })

      if (!res.ok) {
        throw new Error(`Request failed: ${res.status}`)
      }

      const data = (await res.json()) as { answer?: string }
      const answer = data.answer

      if (!answer) {
        throw new Error("Missing answer in response")
      }

      setMessages((prev) => [...prev, makeMessage("bot", answer)])
      setQuestion("")
    } catch {
      setError(ERROR_MESSAGE)
    } finally {
      setIsLoading(false)
    }
  }

  function clearChat() {
    setMessages([])
    setQuestion("")
    setError(null)
    setLastQuestion("")
  }

  return (
    <ChatShell>
      <header className="chat-header">
        <div className="chat-header-top">
          <p className="chat-kicker">RAG UPCHAT</p>
          <a className="admin-link" href="/admin">
            Admin
          </a>
        </div>
        <h1>Contextual AI Assistant</h1>
        <p className="chat-subtitle">Fast answers from vector search + Gemini. Built for real conversations.</p>
      </header>

      <MessageList messages={messages} />

      <div className="chat-toolbar">
        <ChatStatus isLoading={isLoading} error={error} />
        <div className="chat-actions">
          {error && lastQuestion ? (
            <button type="button" data-testid="retry-button" className="ghost-button" onClick={() => ask(lastQuestion)}>
              Retry
            </button>
          ) : null}
          <button
            type="button"
            data-testid="clear-chat-button"
            className="ghost-button"
            onClick={clearChat}
            disabled={messages.length === 0 && !question && !error}
          >
            Clear chat
          </button>
        </div>
      </div>

      <ChatComposer value={question} disabled={isLoading} onChange={setQuestion} onSubmit={() => ask()} />
    </ChatShell>
  )
}
