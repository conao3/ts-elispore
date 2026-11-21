import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { melpaRecipeSchema } from "../src/catalog.ts"
import { readList } from "../src/recipe-form.ts"
import type { Form } from "../src/recipe-form.ts"
import { api, githubCatalogEntry } from "./catalog.ts"

export function parseRecipe(source: string) {
  const [name, ...plist] = readList(source)
  const fields = new Map<string, Form>()
  for (let i = 0; i < plist.length; i += 2) {
    const [key, value] = [plist[i], plist[i + 1]]
    if (key?.kind !== "symbol" || !key.value.startsWith(":") || !value) {
      throw new Error("Expected recipe keyword/value pairs")
    }
    if (!fields.has(key.value)) fields.set(key.value, value)
  }
  function field(key: string, kind: "symbol" | "string") {
    const value = fields.get(key)
    if (!value) return undefined
    if (value.kind !== kind) throw new Error(`Expected a ${kind} for ${key}`)
    return value.value
  }
  const files = fields.get(":files")
  if (files && files.kind !== "list") throw new Error("Expected a list for :files")
  const recipe = melpaRecipeSchema.parse({
    name: name?.kind === "symbol" ? name.value : undefined,
    fetcher: field(":fetcher", "symbol"),
    repo: field(":repo", "string"),
    url: field(":url", "string"),
    branch: field(":branch", "string"),
    commit: field(":commit", "string"),
    files: files?.source,
  })
  if (["github", "gitlab", "codeberg", "sourcehut"].includes(recipe.fetcher) && !recipe.repo) {
    throw new Error(`:repo is required for ${recipe.fetcher}`)
  }
  if (["git", "hg"].includes(recipe.fetcher) && !recipe.url) {
    throw new Error(`:url is required for ${recipe.fetcher}`)
  }
  return recipe
}

export function githubRepository(recipe: ReturnType<typeof parseRecipe>) {
  const repo =
    recipe.fetcher === "github"
      ? recipe.repo
      : recipe.fetcher === "git"
        ? recipe.url
            ?.match(
              /^(?:(?:https?|git|ssh):\/\/(?:git@)?github\.com\/|git@github\.com:)([^/?#]+\/[^/?#]+?)\/?$/i,
            )?.[1]
            ?.replace(/\.git$/i, "")
        : undefined
  if (repo && /^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(repo) && !/\/\.{1,2}$/.test(repo)) return repo
  if (recipe.fetcher === "github") throw new Error("Expected a GitHub owner/repository")
}

export function convertShard(
  input: string,
  output: string,
  start: number,
  end: number,
  lookup: (repository: string) => unknown,
) {
  const names = readdirSync(input, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
    .map((entry) => entry.name)
    .sort()
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= end ||
    end > names.length
  ) {
    throw new Error(`Expected a nonempty range within [0, ${names.length})`)
  }

  mkdirSync(output, { recursive: true })
  const skipped: string[] = []
  const entries = new Map<string, ReturnType<typeof githubCatalogEntry>>()
  for (const name of names.slice(start, end)) {
    try {
      const melpa = parseRecipe(readFileSync(join(input, name), "utf8"))
      if (melpa.name !== name) throw new Error(`Recipe name ${melpa.name} does not match filename`)
      const repo = githubRepository(melpa)
      if (!repo) {
        skipped.push(`${name}: unsupported source (${melpa.fetcher})`)
        continue
      }
      const key = repo.toLowerCase()
      const entry = entries.get(key) ?? githubCatalogEntry(lookup(repo))
      entries.set(key, entry)
      writeFileSync(
        join(output, `${name}.json`),
        JSON.stringify({ ...entry, melpa }, null, 2) + "\n",
      )
    } catch (cause) {
      throw new Error(`Could not convert MELPA recipe ${name}`, { cause })
    }
  }
  return { converted: end - start - skipped.length, skipped }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, start, end, ...extra] = process.argv.slice(2)
  if (!input || !output || !/^\d+$/.test(start ?? "") || !/^\d+$/.test(end ?? "") || extra.length) {
    throw new Error("Usage: node scripts/melpa.ts <recipes-dir> <output-dir> <start> <end>")
  }
  const result = convertShard(input, output, Number(start), Number(end), (repo) =>
    api(`repos/${repo}`),
  )
  for (const skipped of result.skipped) console.warn(skipped)
  console.log(`Converted ${result.converted} recipes; skipped ${result.skipped.length}`)
}
