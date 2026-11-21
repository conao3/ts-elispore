import { expect, test } from "vite-plus/test"
import { mergeCatalog } from "../scripts/catalog-import"
import { resolveDirectories } from "../scripts/melpa-lisp-dirs"
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

test.each([
  ['("./src/*.el" "snippets")', ["src"], "src"],
  ['("src/other.el" (:exclude "tests/alias.el"))', ["tests"], undefined],
  ['("src/alias.el" "other/alias.el")', ["src", "other"], undefined],
  ['("src/*.el" "other/*.el")', ["src", "other"], undefined],
  ['("src/*.el" "src/nested/*.el")', ["src", "src/nested"], "src"],
  ['("src/*.el" "src/nested/alias*.el")', ["src", "src/nested"], "src"],
  ['("*.el" "src/alias.el")', ["", "src"], ""],
  ['("alias.el" "src/alias*.el")', ["", "src"], ""],
  ['(:defaults "src/alias*.el" ("doc" "doc/alias.el"))', ["src", "doc"], "src"],
] as const)("resolves %s only where a blob exists", (files, existing, expected) => {
  const staged = {
    ...discoveryEntry,
    melpa: { name: "alias", fetcher: "github", branch: "stable", files },
  }
  const directories = resolveDirectories([staged], (query) => {
    expect(query).toContain('repository(owner: "owner", name: "current")')
    expect(query).toContain('expression: "stable:alias.el"')
    expect(query).toContain('expression: "stable:lisp/alias.el"')
    expect(query).not.toContain("/tests/")
    expect(query).not.toContain("stable:tests/")
    expect(query).not.toContain("stable:doc/")
    const objects = Array.from(query.matchAll(/(d\d+): object\(expression: "stable:(.*?)"\)/g))
    const found = objects.map(([, key, path]) => [
      key,
      existing.some((directory) => path === (directory ? directory + "/alias.el" : "alias.el"))
        ? { __typename: "Blob" }
        : null,
    ])
    return { data: { r0: Object.fromEntries(found) } }
  })
  expect(directories).toEqual(expected === undefined ? {} : { alias: expected })
  expect(mergeCatalog(discovery, [staged], directories).entries[0].melpaRecipes?.[0].lispDir).toBe(
    expected,
  )
})
