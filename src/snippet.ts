import type { Entry } from "./catalog"
import type { Filter } from "./query"

export type SnippetFormat = "leaf" | "use-package"
export type SnippetMethod = "vc" | "archive"

function matchingPackage(entry: Entry, filters: Filter[]) {
  const names = new Set([
    ...(entry.melpaRecipes?.map((recipe) => recipe.name) ?? []),
    ...(entry.archives?.map((pkg) => pkg.name) ?? []),
  ])
  const terms = [
    ...new Set(
      filters.flatMap(({ key, value, exclude }) =>
        key === null && value && !exclude ? [value] : [],
      ),
    ),
  ]
  const ranked = [...names]
    .map((name) => {
      const normalized = name.toLowerCase()
      return {
        name,
        matched: terms.filter((term) => normalized.includes(term)).length,
        exact: terms.includes(normalized),
      }
    })
    .filter(({ matched }) => matched > 0)
  ranked.sort(
    (a, b) =>
      b.matched - a.matched || Number(b.exact) - Number(a.exact) || a.name.length - b.name.length,
  )
  return ranked[0]?.name ?? names.values().next().value
}

export function installationSnippet(
  entry: Entry,
  format: SnippetFormat = "leaf",
  filters: Filter[] = [],
  method: SnippetMethod = "vc",
) {
  return installationExample(entry, format, filters, method).code
}

export function installationExample(
  entry: Entry,
  format: SnippetFormat,
  filters: Filter[],
  method: SnippetMethod,
) {
  const name = matchingPackage(entry, filters) ?? entry.name.split("/").at(-1)!.replace(/\.el$/, "")
  const symbol = /^\d/.test(name) ? `\\${name}` : name
  const archives = entry.archives?.filter((pkg) => pkg.name === name) ?? []
  const elpa = archives.filter((pkg) => pkg.source !== "melpa")
  const hasArchive = elpa.length > 0
  if (method === "archive" && hasArchive) {
    return { code: `(${format} ${symbol}\n  :ensure t)`, hasArchive }
  }
  const recipe = entry.melpaRecipes?.find((recipe) => recipe.name === name)
  const melpa = archives.find((pkg) => pkg.source === "melpa")
  const melpaGit = melpa?.gitUrl
  const url =
    melpaGit ??
    elpa.find((pkg) => pkg.gitUrl)?.gitUrl ??
    (archives.length === 0 ? entry.url : undefined)
  if (!url) {
    const note =
      recipe && !["git", "github", "gitlab", "codeberg", "sourcehut"].includes(recipe.fetcher)
        ? `This package uses ${recipe.fetcher}; :vc requires Git.`
        : "No Git repository URL is available for :vc."
    return { code: null, note, hasArchive }
  }
  const options = [`:url ${JSON.stringify(url)}`]
  if (recipe && (!melpa || melpaGit)) {
    if (recipe.branch) options.push(`:branch ${JSON.stringify(recipe.branch)}`)
    if (recipe.lispDir) options.push(`:lisp-dir ${JSON.stringify(recipe.lispDir)}`)
  }
  return { code: `(${format} ${symbol}\n  :vc (${options.join(" ")}))`, hasArchive }
}
