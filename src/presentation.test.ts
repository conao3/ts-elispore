import { expect, test } from "vite-plus/test"
import { relativeTime, tokenizeSnippet } from "./presentation"

test("formats relative dates at day, month and year boundaries", () => {
  const now = Date.parse("2026-11-21T00:00:00Z")
  expect(relativeTime("2026-11-21", now)).toBe("Today")
  expect(relativeTime("2026-11-18", now)).toBe("3d ago")
  expect(relativeTime("2026-06-21", now)).toBe("5mo ago")
  expect(relativeTime("2024-11-21", now)).toBe("2y ago")
})
test("tokenization preserves snippets exactly, including empty input and escaped strings", () => {
  for (const format of ["leaf", "use-package"] as const) {
    const code = `(${format} vertico\n  :vc (:url "https://github.com/minad/vertico"))`
    const tokens = tokenizeSnippet(code)
    expect(tokens.map((t) => t.text).join("")).toBe(code)
    expect(tokens.some((t) => t.kind === "form")).toBe(true)
    expect(tokens.some((t) => t.kind === "keyword")).toBe(true)
    expect(tokens.some((t) => t.kind === "string")).toBe(true)
  }
  expect(tokenizeSnippet("")).toEqual([])
  const unusual = '("a\\\"b" :url'
  expect(
    tokenizeSnippet(unusual)
      .map((t) => t.text)
      .join(""),
  ).toBe(unusual)
})
