type AppToastProps = {
  kind: "info" | "error" | "success"
  text: string
}

export default function AppToast({ kind, text }: AppToastProps) {
  return (
    <p className={`app-toast ${kind}`} role="status" aria-live="polite">
      {text}
    </p>
  )
}
