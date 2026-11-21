export function relativeTime(date: string, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(date)) / 86400000))
  return days < 1
    ? "Today"
    : days < 30
      ? `${days}d ago`
      : days < 365
        ? `${Math.floor(days / 30)}mo ago`
        : `${Math.floor(days / 365)}y ago`
}

export function tokenizeSnippet(code: string) {
  return (
    code.match(/"(?:\\.|[^"\\])*"|:[\w-]+|\b(?:leaf|use-package)\b|[()]|[^"():]+|./g) ?? []
  ).map((text) => ({
    text,
    kind: text.startsWith('"')
      ? "string"
      : text.startsWith(":")
        ? "keyword"
        : text === "leaf" || text === "use-package"
          ? "form"
          : text === "(" || text === ")"
            ? "paren"
            : "plain",
  }))
}
