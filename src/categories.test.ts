import { expect, test } from "vite-plus/test"
import { deriveCategories } from "./categories"
test("preserves acronym casing in category labels", () => {
  expect(
    deriveCategories([
      { topics: ["html", "lsp", "ai", "css", "json", "yaml", "sql", "latex", "git"] },
    ])
      .slice(1)
      .map((c) => c.label),
  ).toEqual(["AI", "CSS", "Git", "HTML", "JSON", "LaTeX", "LSP", "SQL", "YAML"])
})

test("ranks informative topics by repository count and humanizes labels", () => {
  expect(
    deriveCategories([
      { topics: ["emacs", "org-mode", "org-mode", "python"] },
      { topics: ["org-mode", "emacs-theme"] },
    ]),
  ).toEqual([
    { label: "All packages", topic: "", count: 2 },
    { label: "Org mode", topic: "org-mode", count: 2 },
    { label: "Python", topic: "python", count: 1 },
    { label: "Themes", topic: "theme", count: 1 },
  ])
})

test("limits the default topics to ten with deterministic ties", () => {
  const entries = Array.from({ length: 12 }, (_, i) => ({
    topics: [`topic-${String(i).padStart(2, "0")}`],
  }))
  expect(
    deriveCategories(entries)
      .slice(1)
      .map((c) => c.topic),
  ).toEqual(entries.slice(0, 10).map((e) => e.topics[0]))
})

test("appends selected rare, generic, and unknown topics without duplicates", () => {
  expect(
    deriveCategories(
      [{ topics: ["emacs", "org-mode"] }],
      ["emacs", "unknown", "org-mode", "unknown"],
    ).slice(1),
  ).toEqual([
    { label: "Org mode", topic: "org-mode", count: 1 },
    { label: "Emac", topic: "emac", count: 1 },
    { label: "Unknown", topic: "unknown", count: 0 },
  ])
})

test("merges topic variants and counts each repository once", () => {
  expect(
    deriveCategories(
      [
        { topics: ["emacs-theme", "dark-theme", "themes", "emacs-mode", "major-mode"] },
        { topics: ["color-theme", "light-theme", "emacs-themes"] },
      ],
      ["EMACS-THEMES", "mode"],
    ),
  ).toEqual([
    { label: "All packages", topic: "", count: 2 },
    { label: "Themes", topic: "theme", count: 2 },
    { label: "Major modes", topic: "major-mode", count: 1 },
  ])
})

test("handles an empty catalog and empty topic lists", () => {
  expect(deriveCategories([])).toEqual([{ label: "All packages", topic: "", count: 0 }])
  expect(deriveCategories([{ topics: [] }])).toEqual([
    { label: "All packages", topic: "", count: 1 },
  ])
})
