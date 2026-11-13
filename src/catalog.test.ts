import { test, expect } from "vite-plus/test"
import { search, catalogSchema } from "./catalog"
const entry = {
  id: 1,
  name: "conao3/leaner-ts-mode.el",
  description: "Lean theorem prover",
  url: "https://github.com/conao3/leaner-ts-mode.el",
  stars: 1,
  updated: "2026-11-13",
  archived: false,
  topics: ["emacs"],
  license: "GPL-3.0",
}
test("matches all words across metadata without case sensitivity", () => {
  expect(search([entry], "LEAN emacs", "stars", false)).toEqual([entry])
  expect(search([entry], "lean python", "stars", false)).toEqual([])
})
test("archived repositories are opt in", () => {
  expect(search([{ ...entry, archived: true }], "", "stars", false)).toEqual([])
})
test("rejects links outside GitHub", () => {
  expect(
    catalogSchema.safeParse({
      generatedAt: "now",
      sources: [],
      entries: [{ ...entry, url: "https://example.com" }],
    }).success,
  ).toBe(false)
})
