import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as z from "zod"
import { catalogSchema, entrySchema, melpaRecipeSchema } from "../src/catalog.ts"
import type { Entry } from "../src/catalog.ts"
import { readList, type Form } from "../src/recipe-form.ts"
import {
  archiveUrls,
  githubRepositoryName,
  readArchiveSnapshot,
  type ArchiveRecord,
} from "./package-archives.ts"

const stagedSchema = entrySchema.omit({ melpaRecipes: true }).extend({ melpa: melpaRecipeSchema })
export type StagedEntry = z.infer<typeof stagedSchema>
type Catalog = z.infer<typeof catalogSchema>
const directoriesSchema = z.record(z.string(), z.string())

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"))
}

function fileSpec(files?: string) {
  function tree(form: Form): unknown {
    return form.kind === "list" ? form.value.map(tree) : [form.kind, form.value]
  }
  return files === undefined ? undefined : JSON.stringify(readList(files).map(tree))
}

export function mergeCatalog(
  discovery: Catalog,
  staged: StagedEntry[],
  directories: Readonly<Record<string, string>>,
  packages: ArchiveRecord[],
): Catalog {
  const entries = new Map<number, Entry>()
  const github = new Map<string, Entry>()
  const byPackage = new Map<string, Entry>()
  const stagedRecipes = new Map(staged.map((entry) => [entry.melpa.name, entry]))
  function insert(entry: Entry) {
    entries.set(entry.id, entry)
    const repo = githubRepositoryName(entry.url)
    if (repo) github.set(repo.toLowerCase(), entry)
    return entry
  }
  for (const entry of discovery.entries) insert({ ...entry, sources: ["github"] })
  let nextId = -1
  const sourceOrder = ["melpa", "gnu-elpa", "nongnu-elpa"]
  for (const { recipe, ...pkg } of packages.toSorted(
    (a, b) =>
      sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source) ||
      a.name.localeCompare(b.name, "en"),
  )) {
    const packageName = pkg.name.toLowerCase()
    const repo = githubRepositoryName(pkg.gitUrl)
    const stagedEntry = stagedRecipes.get(pkg.name)
    const sameUpstream =
      repo &&
      stagedEntry &&
      [stagedEntry.name, stagedEntry.melpa.repo, githubRepositoryName(stagedEntry.melpa.url)].some(
        (name) => name?.toLowerCase() === repo.toLowerCase(),
      )
    const githubEntry = sameUpstream
      ? (entries.get(stagedEntry.id) ?? github.get(stagedEntry.name.toLowerCase()))
      : repo
        ? github.get(repo.toLowerCase())
        : undefined
    const existingPackage = byPackage.get(packageName)
    let entry = existingPackage ?? githubEntry
    if (!entry) {
      if (sameUpstream) {
        const { melpa: _, ...metadata } = stagedEntry
        entry = insert(metadata)
      } else {
        entry = insert({
          id: nextId--,
          name: repo ?? pkg.name,
          description: pkg.summary ?? "",
          url: pkg.url ?? archiveUrls[pkg.source],
          topics: [],
          license: null,
          language: "Emacs Lisp",
        })
      }
    }
    byPackage.set(packageName, entry)
    entry.sources = [...new Set([...(entry.sources ?? []), pkg.source])]
    entry.archives = [...(entry.archives ?? []), pkg]
    if (recipe) {
      const lispDir =
        sameUpstream &&
        recipe.branch === stagedEntry.melpa.branch &&
        recipe.commit === stagedEntry.melpa.commit &&
        Object.hasOwn(directories, recipe.name) &&
        fileSpec(recipe.files) === fileSpec(stagedEntry.melpa.files)
          ? directories[recipe.name]
          : undefined
      entry.melpaRecipes = [...(entry.melpaRecipes ?? []), { ...recipe, lispDir }]
    }
    if (repo && !existingPackage) github.set(repo.toLowerCase(), entry)
  }
  return {
    generatedAt: discovery.generatedAt,
    sources: [...discovery.sources, ...Object.values(archiveUrls)],
    entries: [...entries.values()].sort(
      (a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id,
    ),
  }
}

export function readStagedEntries(root: string): StagedEntry[] {
  const directory = join(root, "examples/melpa")
  return readdirSync(directory, { withFileTypes: true })
    .filter((file) => file.isFile() && file.name.endsWith(".json"))
    .map(({ name }) => {
      try {
        const entry = stagedSchema.parse(readJson(join(directory, name)))
        if (name !== `${entry.melpa.name}.json`)
          throw new Error("Recipe name does not match filename")
        return entry
      } catch (cause) {
        throw new Error(`Could not import MELPA entry ${name}`, { cause })
      }
    })
}

export function publishedCatalog(root: string): string {
  const discovery = catalogSchema.parse(readJson(join(root, "public/catalog.json")))
  const directories = directoriesSchema.parse(readJson(join(root, "examples/melpa-lisp-dirs.json")))
  return (
    JSON.stringify(
      mergeCatalog(discovery, readStagedEntries(root), directories, readArchiveSnapshot(root)),
    ) + "\n"
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, ...extra] = process.argv.slice(2)
  if (!output || extra.length)
    throw new Error("Usage: node scripts/catalog-import.ts <output-file>")
  writeFileSync(output, publishedCatalog(process.cwd()))
}
