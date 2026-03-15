import type { ReactNode } from "react"

type ChatShellProps = {
  children: ReactNode
}

export default function ChatShell({ children }: ChatShellProps) {
  return (
    <main className="chat-page">
      <div className="ambient ambient-left" aria-hidden="true" />
      <div className="ambient ambient-right" aria-hidden="true" />
      <section className="chat-panel" aria-label="RAG Chat Panel">
        {children}
      </section>
    </main>
  )
}
