import type { KeyboardEvent } from "react"

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
        Message input
      </label>
      <textarea
        id="chat-input"
        data-testid="chat-input"
        className="chat-composer"
        placeholder="Ask anything..."
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
      >
        Send
      </button>
    </div>
  )
}
