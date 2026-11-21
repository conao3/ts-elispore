import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, test, vi } from "vite-plus/test"
import { convertShard, githubRepository, parseRecipe } from "../scripts/melpa"
import { entrySchema } from "./catalog"

test("reads MELPA recipe data without evaluating it or expanding file specs", () => {
  const files = '(:defaults "src/*.el" ("doc" "manual.texi") (:exclude "src/test;case.el"))'
  const recipe = parseRecipe(`
    ; comment before the recipe
    (example :repo "Owner/Repo" :files ${files}
      :commit "origin/stable" :fetcher github ; comment within it
      :branch "stable" :old-names (old-example)) ; trailing comment
  `)
  expect(recipe).toEqual({
    name: "example",
    fetcher: "github",
    repo: "Owner/Repo",
    branch: "stable",
    commit: "origin/stable",
    files,
  })
  expect(githubRepository(recipe)).toBe("Owner/Repo")
  expect(parseRecipe('(example :fetcher github :repo "Owner/Repo")').files).toBeUndefined()
})

test("uses the first form and first fetcher, as MELPA does when looking up a recipe", () => {
  const recipe = parseRecipe('(pkg :fetcher github :repo "owner/repo" :fetcher gitlab))')
  expect(githubRepository(recipe)).toBe("owner/repo")
})

test("rejects malformed recipes and GitHub repository identifiers", () => {
  for (const input of [
    '(pkg :fetcher github :repo "owner/repo"',
    '(pkg :fetcher github :repo "owner/repo" :branch)',
    '(pkg :fetcher "github" :repo "owner/repo")',
    '(pkg :fetcher github :repo "owner/repo" :files "*.el")',
    "(pkg :fetcher git)",
  ]) {
    expect(() => parseRecipe(input)).toThrow()
  }
  expect(() => githubRepository(parseRecipe('(pkg :fetcher github :repo "owner/..")'))).toThrow()
})

test("recognizes GitHub Git URLs and skips sources outside the catalog schema", () => {
  for (const url of ["https://github.com/Owner/Repo.git", "git@github.com:Owner/Repo.git"]) {
    expect(githubRepository(parseRecipe(`(pkg :fetcher git :url "${url}")`))).toBe("Owner/Repo")
  }
  for (const source of [
    'gitlab :repo "group/subgroup/project"',
    'codeberg :repo "owner/project"',
    'sourcehut :repo "owner/project"',
    'hg :url "https://example.org/project"',
    'git :url "https://github.com.example.org/owner/project"',
  ]) {
    expect(githubRepository(parseRecipe(`(pkg :fetcher ${source})`))).toBeUndefined()
  }
})

test("writes distinct recipe files for disjoint shards using actual GitHub entry fields", () => {
  const root = mkdtempSync(join(tmpdir(), "elispore-melpa-"))
  try {
    const input = join(root, "recipes")
    const output = join(root, "output")
    mkdirSync(input)
    writeFileSync(join(input, "c"), '(c :fetcher github :repo "owner/project")')
    writeFileSync(join(input, "b"), '(b :fetcher gitlab :repo "owner/project")')
    writeFileSync(join(input, "a"), '(a :fetcher github :repo "Owner/project" :branch "a")')
    const lookup = vi.fn(() => ({
      id: 123,
      full_name: "Owner/Project",
      description: null,
      html_url: "https://github.com/Owner/Project",
      stargazers_count: 17,
      pushed_at: "2026-03-04T05:06:07Z",
      archived: true,
      fork: false,
      topics: ["emacs"],
      license: { spdx_id: "GPL-3.0" },
      language: "Emacs Lisp",
      owner: { type: "Organization" },
    }))
    expect(convertShard(input, output, 0, 2, lookup)).toEqual({
      converted: 1,
      skipped: ["b: unsupported source (gitlab)"],
    })
    expect(readdirSync(output)).toEqual(["a.json"])
    expect(convertShard(input, output, 2, 3, lookup)).toEqual({ converted: 1, skipped: [] })
    expect(readdirSync(output).sort()).toEqual(["a.json", "c.json"])
    expect(lookup.mock.calls).toEqual([["Owner/project"], ["owner/project"]])
    const a = JSON.parse(readFileSync(join(output, "a.json"), "utf8")) as unknown
    expect(a).toMatchObject({ melpa: { name: "a", branch: "a" } })
    expect(entrySchema.parse(a)).toEqual({
      id: 123,
      name: "Owner/Project",
      description: "",
      url: "https://github.com/Owner/Project",
      stars: 17,
      updated: "2026-03-04T05:06:07Z",
      archived: true,
      topics: ["emacs"],
      license: "GPL-3.0",
      language: "Emacs Lisp",
      ownerType: "Organization",
    })
    expect(() => convertShard(input, output, 2, 4, lookup)).toThrow("within [0, 3)")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
