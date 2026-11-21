import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import type * as z from "zod"
import { catalogSchema, entrySchema, melpaRecipeSchema } from "../src/catalog.ts"

const stagedSchema = entrySchema.omit({ melpaRecipes: true }).extend({ melpa: melpaRecipeSchema })
type StagedEntry = z.infer<typeof stagedSchema>
type Catalog = z.infer<typeof catalogSchema>

export function mergeCatalog(discovery: Catalog, staged: StagedEntry[]): Catalog {
  const entries = new Map(discovery.entries.map((entry) => [entry.id, { ...entry }]))
  for (const { melpa, ...metadata } of staged.toSorted((a, b) =>
    a.melpa.name.localeCompare(b.melpa.name, "en"),
  )) {
    const existing = entries.get(metadata.id)
    if (!existing) {
      entries.set(metadata.id, { ...metadata, melpaRecipes: [melpa] })
    } else {
      existing.melpaRecipes = [...(existing.melpaRecipes ?? []), melpa]
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

export function publishedCatalog(root: string): string {
  const discovery = catalogSchema.parse(readJson(join(root, "public/catalog.json")))
  const directory = join(root, "examples/melpa")
  const staged = readdirSync(directory, { withFileTypes: true })
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
  return JSON.stringify(mergeCatalog(discovery, staged)) + "\n"
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [output, ...extra] = process.argv.slice(2)
  if (!output || extra.length)
    throw new Error("Usage: node scripts/catalog-import.ts <output-file>")
  writeFileSync(output, publishedCatalog(process.cwd()))
}
