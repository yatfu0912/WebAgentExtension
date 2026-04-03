export function toDisplayMath(expression: string) {
  const trimmed = expression.trim()

  if (!trimmed) {
    return ""
  }

  if (
    trimmed.startsWith("$$") ||
    trimmed.startsWith("\\[") ||
    trimmed.startsWith("\\begin{")
  ) {
    return trimmed
  }

  return `$$\n${trimmed}\n$$`
}
