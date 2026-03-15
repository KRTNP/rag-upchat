import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

type MarkdownContentProps = {
  content: string
}

export default function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" />
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
