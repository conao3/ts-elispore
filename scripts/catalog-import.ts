import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import * as z from "zod"
import { catalogSchema, entrySchema, melpaRecipeSchema } from "../src/catalog.ts"

const stagedSchema = entrySchema.omit({ melpaRecipes: true }).extend({ melpa: melpaRecipeSchema })
export type StagedEntry = z.infer<typeof stagedSchema>
type Catalog = z.infer<typeof catalogSchema>
const directoriesSchema = z.record(z.string(), z.string())

export function mergeCatalog(
  discovery: Catalog,
  staged: StagedEntry[],
  directories: Readonly<Record<string, string>> = {},
): Catalog {
  const entries = new Map(discovery.entries.map((entry) => [entry.id, { ...entry }]))
  for (const { melpa, ...metadata } of staged.toSorted((a, b) =>
    a.melpa.name.localeCompare(b.melpa.name, "en"),
  )) {
    const recipe = Object.hasOwn(directories, melpa.name)
      ? { ...melpa, lispDir: directories[melpa.name] }
      : melpa
    const existing = entries.get(metadata.id)
    if (!existing) {
      entries.set(metadata.id, { ...metadata, melpaRecipes: [recipe] })
    } else {
      existing.melpaRecipes = [...(existing.melpaRecipes ?? []), recipe]
    }
  }
  return {
    generatedAt: discovery.generatedAt,
    sources: [...discovery.sources, "https://github.com/melpa/melpa/tree/master/recipes"],
    entries: [...entries.values()].sort(
      (a, b) => a.name.localeCompare(b.name, "en") || a.id - b.id,
    ),
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"))
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
  return JSON.stringify(mergeCatalog(discovery, readStagedEntries(root), directories)) + "\n"
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, ...extra] = process.argv.slice(2)
  if (!output || extra.length)
    throw new Error("Usage: node scripts/catalog-import.ts <output-file>")
  writeFileSync(output, publishedCatalog(process.cwd()))
}
