import type { Entry } from "./catalog"

export function leafSnippet(entry: Entry): string {
  const name = entry.name.split("/").at(-1)!.replace(/\.el$/, "")
  const symbol = /^\d/.test(name) ? `\\${name}` : name
  return `(leaf ${symbol}\n  :vc (:url ${JSON.stringify(entry.url)}))`
}
