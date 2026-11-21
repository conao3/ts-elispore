import { expect, test } from "vite-plus/test"
import { mergeCatalog } from "../scripts/catalog-import"
import { catalogSchema } from "./catalog"
import type { Entry } from "./catalog"

const discoveryEntry: Entry = {
  id: 1,
  name: "owner/current",
  description: "Snapshot from GitHub discovery",
  url: "https://github.com/owner/current",
  stars: 80,
  updated: "2026-11-21T00:00:00Z",
  archived: false,
  topics: ["emacs"],
  license: null,
  language: "Emacs Lisp",
  ownerType: "User",
}
const discovery = {
  generatedAt: "2026-11-21T01:00:00Z",
  sources: ["GitHub search"],
  entries: [discoveryEntry],
}

test("dedupes by GitHub ID, keeps discovery metadata, and preserves every MELPA recipe", () => {
  const first = {
    name: "package-one",
    fetcher: "github",
    repo: "former/old",
    branch: "stable",
    files: '(:defaults "extras/*.el")',
  }
  const second = { name: "package-two", fetcher: "github", repo: "former/old", commit: "abc" }
  const staged = { ...discoveryEntry, name: "former/old", stars: 20 }
  const merged = mergeCatalog(discovery, [
    { ...staged, melpa: second },
    { ...staged, melpa: first },
  ])
  expect(catalogSchema.parse(merged).entries).toEqual([
    { ...discoveryEntry, melpaRecipes: [first, second] },
  ])
  expect(merged.generatedAt).toBe(discovery.generatedAt)
  expect(merged.sources).toEqual([
    "GitHub search",
    "https://github.com/melpa/melpa/tree/master/recipes",
  ])
  expect(discoveryEntry.melpaRecipes).toBeUndefined()
})

test("adds MELPA-only repositories with deterministic metadata and retains search-only entries", () => {
  const first = { name: "alpha", fetcher: "github", repo: "owner/another" }
  const second = { ...first, name: "beta" }
  const staged = {
    ...discoveryEntry,
    id: 2,
    name: "owner/another",
    url: "https://github.com/owner/another",
  }
  const entries = mergeCatalog(discovery, [
    { ...staged, stars: 9, melpa: second },
    { ...staged, stars: 10, melpa: first },
  ]).entries
  expect(entries).toEqual([{ ...staged, stars: 10, melpaRecipes: [first, second] }, discoveryEntry])
})
