export function normalizeTopic(topic: string): string {
  const normalized = topic
    .toLowerCase()
    .replace(/^emacs-/, "")
    .replace(/s$/, "")
  if (normalized.endsWith("-theme")) return "theme"
  if (normalized === "mode" || normalized === "major-mode") return "major-mode"
  return normalized
}
