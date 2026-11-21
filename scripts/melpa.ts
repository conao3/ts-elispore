import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { melpaRecipeSchema } from "../src/catalog.ts"
import { api, githubCatalogEntry } from "./catalog.ts"

type Form =
  | { kind: "symbol" | "string"; value: string }
  | { kind: "list"; value: Form[]; source: string }

function readList(source: string) {
  const tokens = /\s+|;[^\r\n]*|[()]|"(?:\\[\s\S]|[^"\\])*"|[^\s();"\\]+/gy
  let cursor = 0
  function next() {
    while (cursor < source.length) {
      const start = cursor
      tokens.lastIndex = cursor
      const match = tokens.exec(source)
      if (!match) throw new Error(`Invalid recipe syntax at offset ${cursor}`)
      cursor = tokens.lastIndex
      if (!/^[\s;]/.test(match[0])) return { token: match[0], start }
    }
  }
  function read({ token, start }: NonNullable<ReturnType<typeof next>>): Form {
    if (token === "(") {
      const value: Form[] = []
      for (let part = next(); part; part = next()) {
        if (part.token === ")") return { kind: "list", value, source: source.slice(start, cursor) }
        value.push(read(part))
      }
      throw new Error("Unclosed recipe list")
    }
    if (token === ")") throw new Error("Unexpected close parenthesis")
    if (token.startsWith('"')) {
      return { kind: "string", value: token.slice(1, -1).replace(/\\([\s\S])/g, "$1") }
    }
    return { kind: "symbol", value: token }
  }
  const first = next()
  if (!first) throw new Error("Empty recipe")
  const form = read(first)
  if (form.kind !== "list") throw new Error("Expected a recipe list")
  return form.value
}

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
