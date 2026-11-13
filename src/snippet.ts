import type { Entry } from "./catalog"

export type SnippetFormat = "leaf" | "use-package"

export function installationSnippet(entry: Entry, format: SnippetFormat = "leaf"): string {
  const name = entry.name.split("/").at(-1)!.replace(/\.el$/, "")
  const symbol = /^\d/.test(name) ? `\\${name}` : name
  return `(${format} ${symbol}\n  :vc (:url ${JSON.stringify(entry.url)}))`
}
