import { readFileSync } from "node:fs"
import { installationSnippet } from "./snippet"
import { test, expect } from "vite-plus/test"
import { catalogSchema, entrySchema, melpaRecipeSchema } from "./catalog"
import type { Entry } from "./catalog"
import { parseQuery, searchEntries, setQualifier } from "./query"
const entry: Entry = {
  id: 1,
  name: "minad/vertico",
  description: "Vertical completion",
  url: "https://github.com/minad/vertico",
  stars: 1896,
  updated: "2026-10-11T00:00:00Z",
  archived: false,
  topics: ["completion"],
  license: "GPL-3.0",
  language: "Emacs Lisp",
  ownerType: "User",
}
const second: Entry = {
  ...entry,
  id: 2,
  name: "oantolin/embark",
  stars: 1233,
  topics: ["actions"],
  updated: "2026-08-12T00:00:00Z",
}
test("matches all words across repository metadata", () => {
  expect(searchEntries([entry], "VERTICAL completion", "stars")).toEqual([entry])
  expect(searchEntries([entry], "completion python", "stars")).toEqual([])
})
test("matches MELPA package names in free-text search without changing repo qualifiers", () => {
  const imported = {
    ...entry,
    melpaRecipes: [{ name: "package-alias", fetcher: "github", repo: entry.name }],
  }
  expect(searchEntries([imported, second], "PACKAGE-ALIAS repo:minad/vertico", "stars")).toEqual([
    imported,
  ])
  expect(searchEntries([imported], "repo:package-alias", "stars")).toEqual([])
})
test("applies and removes explicit archived filtering", () => {
  expect(searchEntries([{ ...entry, archived: true }], "archived:false", "stars")).toEqual([])
  expect(searchEntries([{ ...entry, archived: true }], "", "stars")).toHaveLength(1)
})
test("keeps existing terms while adding an owner only once", () => {
  const query = setQualifier("completion topic:completion", "user", "minad", true)
  expect(setQualifier(query, "user", "minad", true)).toBe("completion topic:completion user:minad")
})
test("replaces or removes a sidebar qualifier", () => {
  expect(setQualifier("user:minad topic:actions", "topic", "completion")).toBe(
    "user:minad topic:completion",
  )
  expect(setQualifier("user:minad topic:completion", "topic", "")).toBe("user:minad")
})
test("supports quoted language values and numeric filters", () => {
  expect(searchEntries([entry, second], 'language:"Emacs Lisp" stars:>=1800', "stars")).toEqual([
    entry,
  ])
})
test("matches date boundaries and ranges", () => {
  expect(searchEntries([entry, second], "pushed:>=2026-10-11", "stars")).toEqual([entry])
  expect(searchEntries([entry, second], "pushed:2026-08-01..2026-08-31", "stars")).toEqual([second])
})
test("matches actual metadata for topics and licenses", () => {
  expect(searchEntries([entry, second], "topic:completion license:gpl-3.0", "stars")).toEqual([
    entry,
  ])
  expect(searchEntries([entry], "license:mit", "stars")).toEqual([])
})
test("matches normalized topic aliases including exclusions without substring matching", () => {
  const theme = { ...entry, topics: ["emacs-themes", "dark-theme"] }
  const mode = { ...second, topics: ["emacs-mode"] }
  for (const query of ["topic:theme", "topic:EMACS-THEMES", "topic:color-theme"]) {
    expect(searchEntries([theme, mode], query, "stars")).toEqual([theme])
  }
  expect(searchEntries([theme, mode], "topic:major-mode", "stars")).toEqual([mode])
  expect(searchEntries([theme, mode], "-topic:light-theme", "stars")).toEqual([mode])
  expect(searchEntries([entry, second], "topic:action", "stars")).toEqual([second])
  expect(searchEntries([entry], "topic:complete", "stars")).toEqual([])
  expect(searchEntries([{ ...entry, topics: [] }], "topic:theme", "stars")).toEqual([])
})
test("combines multiple owners and excluded repositories", () => {
  expect(
    searchEntries([entry, second], "user:minad user:oantolin -repo:minad/vertico", "stars"),
  ).toEqual([second])
})
test("distinguishes users from organizations", () => {
  expect(searchEntries([entry], "org:minad", "stars")).toEqual([])
  expect(
    searchEntries([{ ...entry, ownerType: "Organization" }], "org:minad", "stars"),
  ).toHaveLength(1)
})
test("supports numeric ranges", () => {
  expect(searchEntries([entry, second], "stars:1200..1500", "stars")).toEqual([second])
})
test("sorts deterministically", () => {
  expect(searchEntries([second, entry], "", "updated")[0]).toEqual(entry)
  expect(searchEntries([second, entry], "", "name")[0]).toEqual(entry)
})
test("rejects malformed and unknown qualifiers", () => {
  for (const query of [
    'language:"Emacs Lisp',
    "unknown:x",
    "stars:lots",
    "archived:yes",
    "pushed:yesterday",
  ])
    expect(() => parseQuery(query)).toThrow()
})
test("quotes values added through controls", () => {
  expect(setQualifier("user:minad", "language", "Emacs Lisp")).toBe(
    'user:minad language:"Emacs Lisp"',
  )
})
test("rejects links outside HTTPS GitHub", () => {
  for (const url of ["https://example.com", "http://github.com/minad/vertico"])
    expect(
      catalogSchema.safeParse({ generatedAt: "now", sources: [], entries: [{ ...entry, url }] })
        .success,
    ).toBe(false)
})

test("generates a leaf VC declaration", () => {
  expect(installationSnippet(entry)).toBe(
    '(leaf vertico\n  :vc (:url "https://github.com/minad/vertico"))',
  )
})
test("removes the repository .el suffix for the leaf name", () => {
  expect(
    installationSnippet({
      ...entry,
      name: "conao3/leaner-ts-mode.el",
      url: "https://github.com/conao3/leaner-ts-mode.el",
    }),
  ).toBe('(leaf leaner-ts-mode\n  :vc (:url "https://github.com/conao3/leaner-ts-mode.el"))')
})

test("generates a use-package VC declaration when selected", () => {
  expect(installationSnippet(entry, "use-package")).toBe(
    '(use-package vertico\n  :vc (:url "https://github.com/minad/vertico"))',
  )
})

test("uses the queried MELPA recipe's name, branch, and exact source directory in both formats", () => {
  const imported = {
    ...entry,
    name: "owner/monorepo",
    url: "https://github.com/owner/monorepo",
    melpaRecipes: [
      { name: "pkg", fetcher: "github", files: '("pkg.el")' },
      {
        name: "pkg-mode",
        fetcher: "github",
        branch: "stable",
        files:
          '("src/elisp/pkg-mode.el" ("target" "extra/pkg-mode.el") (:exclude "test/pkg-mode.el"))',
      },
    ],
  }
  const options =
    ':vc (:url "https://github.com/owner/monorepo" :branch "stable" :lisp-dir "src/elisp")'
  expect(installationSnippet(imported, "leaf", parseQuery('repo:owner/monorepo "PKG-MODE"'))).toBe(
    `(leaf pkg-mode\n  ${options})`,
  )
  expect(installationSnippet(imported, "use-package", parseQuery("mode"))).toBe(
    `(use-package pkg-mode\n  ${options})`,
  )
  for (const filters of [parseQuery("repo:owner/monorepo"), parseQuery("pkg")]) {
    expect(installationSnippet(imported, "leaf", filters)).toBe(
      '(leaf pkg\n  :vc (:url "https://github.com/owner/monorepo"))',
    )
  }
})

test("uses a single Lisp glob directory and omits only the directory for ambiguous layouts", () => {
  function snippet(files: string) {
    return installationSnippet({
      ...entry,
      melpaRecipes: [{ name: "alias", fetcher: "github", files, branch: "stable" }],
    })
  }
  expect(snippet('("./src/*.el" "snippets")')).toBe(
    '(leaf alias\n  :vc (:url "https://github.com/minad/vertico" :branch "stable" :lisp-dir "src"))',
  )
  const withoutDirectory =
    '(leaf alias\n  :vc (:url "https://github.com/minad/vertico" :branch "stable"))'
  expect(snippet('("src/other.el" (:exclude "tests/alias.el"))')).toBe(withoutDirectory)
  expect(snippet('("src/alias.el" "other/alias.el")')).toBe(withoutDirectory)
  expect(snippet('("src/*.el" "other/*.el")')).toBe(withoutDirectory)
  expect(snippet('("src/*.el" "src/nested/*.el")')).toBe(
    '(leaf alias\n  :vc (:url "https://github.com/minad/vertico" :branch "stable" :lisp-dir "src"))',
  )
  expect(snippet('("src/*.el" "src/nested/alias*.el")')).toBe(
    '(leaf alias\n  :vc (:url "https://github.com/minad/vertico" :branch "stable" :lisp-dir "src"))',
  )
  expect(snippet('("*.el" "src/alias.el")')).toBe(withoutDirectory)
  expect(snippet('("alias.el" "src/alias*.el")')).toBe(withoutDirectory)
})

test.each([
  ["annotation", "agda/agda", "", "src/data/emacs-mode"],
  ["compile-multi-embark", "mohkale/compile-multi", "", "extensions/compile-multi-embark"],
  ["elnode", "jcaw/elnode", "melpa", ""],
  ["ess", "emacs-ess/ESS", "", "lisp"],
  ["easysession", "jamescherti/easysession.el", "", ""],
  ["guava-themes", "bormoge/guava-themes", "", ""],
])(
  "generates the installation example from the real %s recipe",
  (name, repository, branch, directory) => {
    const file = new URL(`../examples/melpa/${name}.json`, import.meta.url)
    const staged: unknown = JSON.parse(readFileSync(file, "utf8"))
    const { melpa, ...entry } = entrySchema.extend({ melpa: melpaRecipeSchema }).parse(staged)
    const imported = {
      ...entry,
      melpaRecipes: [{ name: "other-package", fetcher: "github" }, melpa],
    }
    const options = [
      `:url "https://github.com/${repository}"`,
      ...(branch ? [`:branch "${branch}"`] : []),
      ...(directory ? [`:lisp-dir "${directory}"`] : []),
    ]
    expect(installationSnippet(imported, "leaf", parseQuery(name))).toBe(
      `(leaf ${name}\n  :vc (${options.join(" ")}))`,
    )
  },
)
