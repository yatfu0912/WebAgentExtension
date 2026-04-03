import type { ComponentPropsWithoutRef } from "react"
import rehypeKatex from "rehype-katex"
import type { Components } from "react-markdown"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"

import { cn } from "@/lib/utils"

const markdownComponents: Components = {
  h1: ({ className, ...props }) => (
    <h1
      className={cn("text-lg font-semibold tracking-tight text-foreground", className)}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2 className={cn("text-base font-semibold text-foreground", className)} {...props} />
  ),
  h3: ({ className, ...props }) => (
    <h3 className={cn("text-sm font-semibold text-foreground", className)} {...props} />
  ),
  p: ({ className, ...props }) => (
    <p className={cn("text-sm leading-6 text-foreground", className)} {...props} />
  ),
  ul: ({ className, ...props }) => (
    <ul className={cn("ml-5 flex list-disc flex-col gap-2", className)} {...props} />
  ),
  ol: ({ className, ...props }) => (
    <ol className={cn("ml-5 flex list-decimal flex-col gap-2", className)} {...props} />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("pl-1 text-sm leading-6 text-foreground", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props} />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "break-all text-primary underline underline-offset-4 hover:text-primary/80",
        className
      )}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "border-l-2 border-border pl-4 text-sm leading-6 text-muted-foreground italic",
        className
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("border-border", className)} {...props} />
  ),
  table: ({ className, ...props }) => (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm", className)} {...props} />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead className={cn("border-b border-border", className)} {...props} />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "border border-border bg-secondary px-3 py-2 text-left font-medium text-foreground",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn("border border-border px-3 py-2 align-top text-foreground", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      className={cn(
        "overflow-x-auto rounded-xl border border-border bg-secondary px-4 py-3 text-xs leading-6 text-foreground",
        className
      )}
      {...props}
    />
  ),
  code: ({ className, children, ...props }) => {
    const content = String(children).replace(/\n$/, "")
    const isBlock = className?.includes("language-") || content.includes("\n")

    if (isBlock) {
      return (
        <code className={cn("font-mono text-xs text-foreground", className)} {...props}>
          {content}
        </code>
      )
    }

    return (
      <code
        className={cn(
          "rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.82rem] text-foreground",
          className
        )}
        {...props}
      >
        {content}
      </code>
    )
  },
}

interface ChatMessageMarkdownProps extends ComponentPropsWithoutRef<"div"> {
  content: string
}

export function ChatMessageMarkdown({
  className,
  content,
  ...props
}: ChatMessageMarkdownProps) {
  return (
    <div className={cn("chat-markdown flex flex-col gap-3", className)} {...props}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
