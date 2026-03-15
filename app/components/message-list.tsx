"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { Copy, Check } from "lucide-react"
import MarkdownContent from "@/app/components/markdown-content"
import type { ChatMessage } from "@/app/lib/chat-types"

type MessageListProps = {
  messages: ChatMessage[]
}

export default function MessageList({ messages }: MessageListProps) {
  const endRef = useRef<HTMLDivElement | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="message-list empty-state" aria-live="polite">
        <h2>เริ่มต้นการสนทนา</h2>
        <p>สอบถามข้อมูล กยศ. หรือพูดคุยเรื่องทั่วไป ผู้ช่วย AI ของมหาวิทยาลัยพะเยาพร้อมให้บริการคุณแล้ว</p>
      </div>
    )
  }

  async function copyMessage(message: ChatMessage) {
    try {
      await navigator.clipboard.writeText(message.text)
      setCopiedId(message.id)
      window.setTimeout(() => setCopiedId((prev) => (prev === message.id ? null : prev)), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message, index) => (
        <article
          key={message.id}
          className={`message-row ${message.role === "user" ? "user" : "bot"} message-enter`}
          style={{ "--message-index": index } as CSSProperties}
        >
          <span className="message-bubble">
            {message.role === "bot" ? <MarkdownContent content={message.text} /> : message.text}
            <span className="message-meta">
              <time data-testid="message-time" dateTime={message.createdAt}>
                {new Date(message.createdAt).toLocaleTimeString("th-TH", {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </time>
              {message.role === "bot" ? (
                <button
                  type="button"
                  className="copy-button"
                  onClick={() => copyMessage(message)}
                  aria-label="คัดลอกข้อความ"
                  title="คัดลอกข้อความ"
                >
                  {copiedId === message.id ? <Check size={14} color="var(--accent)" /> : <Copy size={14} />}
                </button>
              ) : null}
            </span>
          </span>
        </article>
      ))}
      <div ref={endRef} />
    </div>
  )
}
