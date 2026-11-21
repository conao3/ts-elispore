export function normalizeTopic(topic: string): string {
  let normalized = topic.toLowerCase().replace(/^emacs-/, "")
  if (normalized.length > 3 && normalized !== "emacs" && !normalized.endsWith("ss"))
    normalized = normalized.replace(/s$/, "")
  if (normalized.endsWith("-theme")) return "theme"
  if (normalized === "mode" || normalized === "major-mode") return "major-mode"
  return normalized
}
