import type { Entry } from "./catalog"
import { normalizeTopic } from "./topics"
const acronyms: Record<string, string> = {
  html: "HTML",
  lsp: "LSP",
  ai: "AI",
  [normalizeTopic("css")]: "CSS",
  json: "JSON",
  yaml: "YAML",
  sql: "SQL",
  latex: "LaTeX",
}

const genericTopics = new Set(
  [
    "emacs",
    "emacs-lisp",
    "elisp",
    "emacs-package",
    "emacs-packages",
    "melpa",
    "emacs-plugin",
    "package",
    "lisp",
    "hacktoberfest",
    "emacs-configuration",
    "emacs-customizations",
    "emacs-initialization",
    "dotfiles",
    "configuration",
    "config",
    "emacs-config",
    "emacs-configs",
    "emacs-dotfiles",
    "gnu-emacs",
    "emacs-module",
    "emacs-modules",
    "github",
    "open-source",
  ].map(normalizeTopic),
)

export function deriveCategories(entries: Pick<Entry, "topics">[], selectedTopics: string[] = []) {
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const topic of new Set(entry.topics.map(normalizeTopic)))
      counts.set(topic, (counts.get(topic) ?? 0) + 1)
  }
  const topics = [...counts.keys()]
    .filter((topic) => !genericTopics.has(topic))
    .sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
    .slice(0, 10)
  for (const topic of selectedTopics.map(normalizeTopic)) {
    if (topic && !topics.includes(topic)) topics.push(topic)
  }
  return [
    { label: "All packages", topic: "", count: entries.length },
    ...topics.map((topic) => ({
      label:
        topic === "theme"
          ? "Themes"
          : topic === "major-mode"
            ? "Major modes"
            : (acronyms[topic] ??
              topic.charAt(0).toUpperCase() + topic.slice(1).replaceAll("-", " ")),
      topic,
      count: counts.get(topic) ?? 0,
    })),
  ]
}
