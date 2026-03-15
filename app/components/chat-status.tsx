type ChatStatusProps = {
  isLoading: boolean
  error: string | null
}

export default function ChatStatus({ isLoading, error }: ChatStatusProps) {
  if (error) {
    return (
      <p className="chat-status chat-error" role="alert">
        {error}
      </p>
    )
  }

  if (isLoading) {
    return (
      <div className="chat-status status-loading" data-testid="chat-status" aria-live="polite">
        <span>ระบบกำลังประมวลผล</span>
        <span className="typing-dots" data-testid="typing-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
    )
  }

  return (
    <p className="chat-status" aria-live="polite">
      พร้อมใช้งาน
    </p>
  )
}
