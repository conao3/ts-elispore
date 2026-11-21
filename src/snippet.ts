import type { Entry } from "./catalog"
import type { Filter } from "./query"

export type SnippetFormat = "leaf" | "use-package"

function matchingRecipe(entry: Entry, filters: Filter[]) {
  const recipes = entry.melpaRecipes ?? []
  const terms = [
    ...new Set(
      filters.flatMap(({ key, value, exclude }) =>
        key === null && value && !exclude ? [value] : [],
      ),
    ),
  ]
  const ranked = recipes
    .map((recipe) => {
      const name = recipe.name.toLowerCase()
      return {
        recipe,
        matched: terms.filter((term) => name.includes(term)).length,
        exact: terms.includes(name),
      }
    })
    .filter(({ matched }) => matched > 0)
  ranked.sort(
    (a, b) =>
      b.matched - a.matched ||
      Number(b.exact) - Number(a.exact) ||
      a.recipe.name.length - b.recipe.name.length,
  )
  return ranked[0]?.recipe ?? recipes[0]
}

export function installationSnippet(
  entry: Entry,
  format: SnippetFormat = "leaf",
  filters: Filter[] = [],
): string {
  const recipe = matchingRecipe(entry, filters)
  const name = recipe?.name ?? entry.name.split("/").at(-1)!.replace(/\.el$/, "")
  const symbol = /^\d/.test(name) ? `\\${name}` : name
  const options = [`:url ${JSON.stringify(entry.url)}`]
  if (recipe?.branch) options.push(`:branch ${JSON.stringify(recipe.branch)}`)
  if (recipe?.lispDir) options.push(`:lisp-dir ${JSON.stringify(recipe.lispDir)}`)
  return `(${format} ${symbol}\n  :vc (${options.join(" ")}))`
}
