import type { KeyboardEvent } from "react"
import { SendHorizonal } from "lucide-react"

type ChatComposerProps = {
  value: string
  disabled: boolean
  onChange: (value: string) => void
  onSubmit: () => void
}

export default function ChatComposer({ value, disabled, onChange, onSubmit }: ChatComposerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="chat-composer-wrap">
      <label className="sr-only" htmlFor="chat-input">
        ช่องพิมพ์ข้อความ
      </label>
      <textarea
        id="chat-input"
        data-testid="chat-input"
        className="chat-composer"
        placeholder="พิมพ์คำถามของคุณที่นี่..."
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={2}
      />
      <button
        type="button"
        data-testid="send-button"
        className="chat-send"
        onClick={onSubmit}
        disabled={disabled}
        aria-label="ส่งข้อความ"
      >
        <SendHorizonal size={20} />
      </button>
    </div>
  )
}
