import { packageNameSchema, type Entry, type Source } from "./catalog"
import { normalizeTopic } from "./topics"

export type Filter = { raw: string; key: string | null; value: string; exclude: boolean }
const supported = new Set([
  "user",
  "org",
  "repo",
  "topic",
  "license",
  "archived",
  "pushed",
  "stars",
  "language",
  "source",
])
export function tokenize(value: string): string[] {
  const tokens: string[] = []
  let current = "",
    quoted = false
  for (const char of value) {
    if (char === '"') quoted = !quoted
    if (/\s/.test(char) && !quoted) {
      if (current) tokens.push(current)
      current = ""
    } else current += char
  }
  if (quoted) throw new Error("Close the quotation mark to finish your query.")
  if (current) tokens.push(current)
  return tokens
}
export function parseQuery(value: string): Filter[] {
  return tokenize(value).map((raw) => {
    const match = /^(-?)([a-z]+):(.+)$/i.exec(raw)
    if (!match)
      return { raw, key: null, value: raw.replace(/^"|"$/g, "").toLowerCase(), exclude: false }
    const key = match[2].toLowerCase(),
      tokenValue = match[3].replace(/^"|"$/g, "").toLowerCase()
    if (!supported.has(key))
      throw new Error(
        `Unsupported filter: ${key}. Use user, org, repo, topic, license, archived, pushed, stars, language, or source.`,
      )
    if (key === "archived" && !["true", "false"].includes(tokenValue))
      throw new Error("Use archived:true or archived:false.")
    if (
      key === "pushed" &&
      !/^(?:>=|<=|>|<)?\d{4}-\d{2}-\d{2}(?:\.\.\d{4}-\d{2}-\d{2})?$/.test(tokenValue)
    )
      throw new Error("Use a date such as pushed:>=2026-01-01.")
    if (key === "stars" && !/^(?:>=|<=|>|<)?\d+(?:\.\.\d+)?$/.test(tokenValue))
      throw new Error("Use a number such as stars:>=1000.")
    return { raw, key, value: tokenValue, exclude: match[1] === "-" }
  })
}
export function setQualifier(query: string, key: string, value: string, append = false): string {
  let tokens = tokenize(query)
  if (!append)
    tokens = tokens.filter((token) => /^-?([a-z]+):/i.exec(token)?.[1].toLowerCase() !== key)
  if (value) {
    const token = `${key}:${/\s/.test(value) ? JSON.stringify(value) : value}`
    if (!tokens.some((existing) => existing.toLowerCase() === token.toLowerCase()))
      tokens.push(token)
  }
  return tokens.join(" ")
}
function compare(value: string | number, condition: string): boolean {
  if (condition.includes("..")) {
    const [lo, hi] = condition.split("..")
    return typeof value === "number"
      ? value >= Number(lo) && value <= Number(hi)
      : value >= lo && value <= hi
  }
  const [, op = "", target] = /^(>=|<=|>|<)?(.+)$/.exec(condition)!
  const left = typeof value === "number" ? value : value
  if (typeof left === "number") {
    const right = Number(target)
    return op === ">="
      ? left >= right
      : op === "<="
        ? left <= right
        : op === ">"
          ? left > right
          : op === "<"
            ? left < right
            : left === right
  }
  return op === ">="
    ? left >= target
    : op === "<="
      ? left <= target
      : op === ">"
        ? left > target
        : op === "<"
          ? left < target
          : left === target
}
export function matches(entry: Entry, filters: Filter[]): boolean {
  const [owner] = entry.name.split("/")
  const haystack = [
    entry.name,
    entry.description,
    ...entry.topics,
    ...(entry.melpaRecipes?.map((recipe) => recipe.name) ?? []),
    ...(entry.archives?.map((pkg) => pkg.name) ?? []),
  ]
    .join(" ")
    .toLowerCase()
  const match = (filter: Filter): boolean => {
    switch (filter.key) {
      case null:
        return haystack.includes(filter.value)
      case "user":
        return owner.toLowerCase() === filter.value
      case "org":
        return entry.ownerType === "Organization" && owner.toLowerCase() === filter.value
      case "repo":
        return entry.name.toLowerCase() === filter.value
      case "source":
        return entry.sources?.some((source) => source === filter.value) ?? false
      case "topic":
        return entry.topics.some((topic) => normalizeTopic(topic) === normalizeTopic(filter.value))
      case "license": {
        const license = entry.license?.toLowerCase() ?? ""
        return (
          license === filter.value ||
          license === `${filter.value}-only` ||
          license === `${filter.value}-or-later`
        )
      }
      case "archived":
        return entry.archived === (filter.value === "true")
      case "pushed":
        return compare(entry.updated.slice(0, 10), filter.value)
      case "stars":
        return compare(entry.stars, filter.value)
      case "language":
        return entry.language?.toLowerCase() === filter.value
      default:
        return false
    }
  }
  const owners = filters.filter(
    (filter) => ["user", "org"].includes(filter.key ?? "") && !filter.exclude,
  )
  const licenses = filters.filter((filter) => filter.key === "license" && !filter.exclude)
  const sources = filters.filter((filter) => filter.key === "source" && !filter.exclude)
  return (
    (!owners.length || owners.some(match)) &&
    (!licenses.length || licenses.some(match)) &&
    (!sources.length || sources.some(match)) &&
    filters
      .filter(
        (filter) =>
          !owners.includes(filter) && !licenses.includes(filter) && !sources.includes(filter),
      )
      .every((filter) => (filter.exclude ? !match(filter) : match(filter)))
  )
}

export function checkPrefix(entries: Entry[], filters: Filter[]) {
  const terms = filters.filter(({ key, exclude, value }) => key === null && !exclude && value)
  if (terms.length !== 1) return
  const prefix = terms[0].value.replace(/-+$/, "")
  if (!packageNameSchema.safeParse(prefix).success) return
  const found = new Map<string, Set<Source>>()
  function add(name: string, source: Source) {
    name = name.toLowerCase()
    if (name !== prefix && !name.startsWith(prefix + "-")) return
    const sources = found.get(name) ?? new Set<Source>()
    sources.add(source)
    found.set(name, sources)
  }
  for (const entry of entries) {
    for (const pkg of entry.archives ?? []) add(pkg.name, pkg.source)
    if (entry.sources?.includes("github"))
      add(entry.name.split("/").at(-1)!.replace(/\.el$/, ""), "github")
  }
  return {
    prefix,
    packages: Array.from(found, ([name, sources]) => ({ name, sources: [...sources] })).sort(
      (a, b) => a.name.localeCompare(b.name, "en"),
    ),
  }
}
export function searchEntries(entries: Entry[], query: string, sort: string): Entry[] {
  const filters = parseQuery(query)
  return entries
    .filter((entry) => matches(entry, filters))
    .sort((a, b) =>
      sort === "stars"
        ? b.stars - a.stars || a.name.localeCompare(b.name)
        : sort === "updated"
          ? b.updated.localeCompare(a.updated) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name),
    )
}
