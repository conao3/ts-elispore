import type { Entry } from "./catalog"
import type { Filter } from "./query"
import { readList } from "./recipe-form"
import type { Form } from "./recipe-form"

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

function sourcePaths(forms: Form[]): string[] {
  return forms.flatMap((form) => {
    if (form.kind === "string") return [form.value.replace(/^(?:\.\/)+/, "")]
    if (form.kind === "list" && form.value[0]?.kind === "string") {
      return sourcePaths(form.value.slice(1))
    }
    return []
  })
}

function matchesFileGlob(pattern: string, file: string): boolean {
  const glob = pattern.replace(/[^a-zA-Z0-9_-]/g, (character) =>
    character === "*" ? ".*" : character === "?" ? "." : `\\${character}`,
  )
  return new RegExp(`^${glob}$`).test(file)
}

function recipeDirectory(name: string, files?: string) {
  if (!files) return ""
  try {
    const forms = readList(files)
    const mainFile = `${name}.el`
    const sources = sourcePaths(forms)
    const exact = new Set<string>()
    const wildcards = new Set<string>()
    for (const source of sources) {
      const parts = source.split("/")
      const file = parts.pop()
      if (parts.some((part) => !part || part === ".." || /[*?[\]]/.test(part))) continue
      if (file === mainFile) exact.add(parts.join("/"))
      else if (file && matchesFileGlob(file, mainFile)) wildcards.add(parts.join("/"))
    }
    if (exact.size) return exact.size === 1 ? [...exact][0] : undefined
    if (forms.some((form) => form.kind === "symbol" && form.value === ":defaults")) return ""
    if (wildcards.size === 1) return [...wildcards][0]
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
