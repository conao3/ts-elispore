import type { Entry } from "./catalog"
import type { Filter } from "./query"
import { readList } from "./recipe-form"

export type SnippetFormat = "leaf" | "use-package"

function matchingRecipe(entry: Entry, filters: Filter[]) {
  const recipes = entry.melpaRecipes ?? []
  const terms = filters.filter(({ key, value, exclude }) => key === null && value && !exclude)
  return (
    recipes.find((recipe) => terms.some(({ value }) => recipe.name.toLowerCase() === value)) ??
    recipes.find((recipe) =>
      terms.some(({ value }) => recipe.name.toLowerCase().includes(value)),
    ) ??
    recipes[0]
  )
}

function matchesFileGlob(pattern: string, file: string): boolean {
  const glob = pattern.replace(/[^a-zA-Z0-9_-]/g, (character) =>
    character === "*" ? ".*" : character === "?" ? "." : `\\${character}`,
  )
  return new RegExp(`^${glob}$`).test(file)
}

function shallowestDirectory(directories: Set<string>) {
  const depth = (directory: string) => (directory ? directory.split("/").length : 0)
  const [first, second] = [...directories].sort((a, b) => depth(a) - depth(b))
  return first !== undefined && (second === undefined || depth(first) < depth(second))
    ? first
    : undefined
}

function recipeDirectory(name: string, files?: string) {
  if (!files) return ""
  try {
    const forms = readList(files)
    if (forms.some((form) => form.kind === "symbol" && form.value === ":defaults")) return ""
    const mainFile = `${name}.el`
    const directories = new Set<string>()
    for (const form of forms) {
      if (form.kind !== "string") continue
      const parts = form.value.replace(/^(?:\.\/)+/, "").split("/")
      const file = parts.pop()
      if (parts.some((part) => !part || part === ".." || /[*?[\]]/.test(part))) continue
      if (file && matchesFileGlob(file, mainFile)) directories.add(parts.join("/"))
    }
    return shallowestDirectory(directories)
  } catch {
    return undefined
  }
}

export function installationSnippet(
  entry: Entry,
  format: SnippetFormat = "leaf",
  filters: Filter[] = [],
): string {
  const recipe = matchingRecipe(entry, filters)
  const directory = recipe && recipeDirectory(recipe.name, recipe.files)
  const name = recipe?.name ?? entry.name.split("/").at(-1)!.replace(/\.el$/, "")
  const symbol = /^\d/.test(name) ? `\\${name}` : name
  const options = [`:url ${JSON.stringify(entry.url)}`]
  if (recipe?.branch) options.push(`:branch ${JSON.stringify(recipe.branch)}`)
  if (directory) options.push(`:lisp-dir ${JSON.stringify(directory)}`)
  return `(${format} ${symbol}\n  :vc (${options.join(" ")}))`
}
