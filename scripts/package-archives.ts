import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync, gzipSync } from "node:zlib"
import * as z from "zod"
import { archivePackageSchema, melpaRecipeSchema, packageNameSchema } from "../src/catalog.ts"

const recordSchema = archivePackageSchema.extend({ recipe: melpaRecipeSchema.optional() })
export type ArchiveRecord = z.infer<typeof recordSchema>
export const archiveSnapshot = "examples/package-archives.jsonl.gz"
export const archiveUrls = {
  melpa: "https://melpa.org/",
  "gnu-elpa": "https://elpa.gnu.org/packages/",
  "nongnu-elpa": "https://elpa.nongnu.org/nongnu/",
}

const version = z.array(z.number().int())
const restRecipes = z.record(packageNameSchema, melpaRecipeSchema.omit({ name: true }))
const restArchive = z.record(
  packageNameSchema,
  z.object({
    desc: z.string().nullable().optional(),
    ver: version,
    props: z.object({ url: z.string().optional() }).nullish(),
  }),
)
const recipeHosts: Record<string, string> = {
  github: "https://github.com/",
  gitlab: "https://gitlab.com/",
  codeberg: "https://codeberg.org/",
  sourcehut: "https://git.sr.ht/",
}

function safeUrl(value?: string, protocols = ["https:", "http:"]) {
  const url = value && URL.parse(value)
  if (url && protocols.includes(url.protocol) && !url.username && !url.password) return url.href
}

export function githubRepositoryName(url?: string) {
  const parsed = url && URL.parse(url)
  if (!parsed || parsed.hostname !== "github.com") return
  return /^\/([\w.-]+\/[\w.-]+)\/?$/.exec(parsed.pathname)?.[1].replace(/\.git$/i, "")
}

function knownGitUrl(url?: string) {
  const safe = safeUrl(url, ["http:", "https:", "git:", "ssh:"])
  if (!safe) return
  const { hostname, pathname, protocol } = new URL(safe)
  if (
    protocol === "git:" ||
    protocol === "ssh:" ||
    pathname.endsWith(".git") ||
    githubRepositoryName(safe) ||
    (["gitlab.com", "codeberg.org", "git.sr.ht"].includes(hostname) && !pathname.includes("/-/"))
  )
    return safe
}

export function parseMelpa(recipes: unknown, archive: unknown): ArchiveRecord[] {
  const releases = restArchive.parse(archive)
  return Object.entries(restRecipes.parse(recipes)).map(([name, fields]) => {
    const recipe = { ...fields, name }
    const host = recipeHosts[fields.fetcher]
    const repo =
      fields.repo && fields.fetcher === "sourcehut"
        ? "~" + fields.repo.replace(/^~/, "")
        : fields.repo
    const upstream = host && repo ? host + repo : fields.url
    const release = releases[name]
    const gitUrl =
      host || fields.fetcher === "git"
        ? safeUrl(upstream, ["http:", "https:", "git:", "ssh:"])
        : undefined
    return recordSchema.parse({
      name,
      source: "melpa",
      summary: release?.desc ?? undefined,
      version: release?.ver.join("."),
      url:
        safeUrl(upstream) ??
        safeUrl(release?.props?.url) ??
        `https://melpa.org/#/${encodeURIComponent(name)}`,
      gitUrl,
      recipe,
    })
  })
}

function readData(input: string) {
  const expression = /\s+|;[^\r\n]*|[()[\]]|"(?:\\[\s\S]|[^"\\])*"|[^\s()[\]";]+/gy
  let offset = 0
  function next() {
    while (offset < input.length) {
      expression.lastIndex = offset
      const match = expression.exec(input)
      if (!match) throw new Error(`Invalid archive syntax at offset ${offset}`)
      offset = expression.lastIndex
      if (!/^[\s;]/.test(match[0])) return match[0]
    }
  }
  function read(token: string, depth: number): unknown {
    if (depth > 32) throw new Error("ELPA archive nesting limit exceeded")
    if (token === "(" || token === "[") {
      const end = token === "(" ? ")" : "]"
      const items = []
      for (let part = next(); part; part = next()) {
        if (part === end) return items
        items.push(read(part, depth + 1))
      }
      throw new Error("Unclosed ELPA archive list or vector")
    }
    if (token === ")" || token === "]") throw new Error("Unexpected ELPA archive delimiter")
    if (/^-?\d+$/.test(token)) return Number(token)
    return token.startsWith('"')
      ? token
          .slice(1, -1)
          .replace(/\\([\s\S])/g, (_, char: string) =>
            char === "n" ? "\n" : char === "t" ? "\t" : char,
          )
      : token
  }
  const first = next()
  if (!first) throw new Error("Empty ELPA index")
  const result = read(first, 0)
  if (next()) throw new Error("Unexpected trailing ELPA data")
  return result
}

const elpaRecord = z.tuple([
  packageNameSchema,
  z.literal("."),
  z.tuple([version, z.unknown(), z.string(), z.string()]).rest(z.unknown()),
])

export function parseElpa(input: string, source: "gnu-elpa" | "nongnu-elpa"): ArchiveRecord[] {
  const [, ...packages] = z
    .tuple([z.literal(1)])
    .rest(elpaRecord)
    .parse(readData(input))
  return packages.map(([name, , [numbers, , summary, , properties]]) => {
    const address = Array.isArray(properties)
      ? properties.find((field: unknown) => Array.isArray(field) && field[0] === ":url")
      : undefined
    const value = z.tuple([z.literal(":url"), z.literal("."), z.string()]).safeParse(address)
    const url = value.success ? value.data[2] : undefined
    return recordSchema.parse({
      name,
      source,
      summary,
      version: numbers.join("."),
      url: safeUrl(url) ?? `${archiveUrls[source]}${encodeURIComponent(name)}.html`,
      gitUrl: knownGitUrl(url),
    })
  })
}

export function readArchiveSnapshot(root: string) {
  return gunzipSync(readFileSync(join(root, archiveSnapshot)))
    .toString("utf8")
    .trimEnd()
    .split("\n")
    .map((line) => recordSchema.parse(JSON.parse(line)))
}

async function get(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`)
  return response
}

export async function refreshArchiveSnapshot(root: string) {
  const [recipes, releases, gnu, nongnu] = await Promise.all([
    get("https://melpa.org/recipes.json").then((r) => r.json()),
    get("https://melpa.org/archive.json").then((r) => r.json()),
    get(archiveUrls["gnu-elpa"] + "archive-contents").then((r) => r.text()),
    get(archiveUrls["nongnu-elpa"] + "archive-contents").then((r) => r.text()),
  ])
  const melpaPackages = parseMelpa(recipes, releases)
  const gnuPackages = parseElpa(gnu, "gnu-elpa")
  const nongnuPackages = parseElpa(nongnu, "nongnu-elpa")
  const packages = [...melpaPackages, ...gnuPackages, ...nongnuPackages]
  writeFileSync(
    join(root, archiveSnapshot),
    gzipSync(packages.map((pkg) => JSON.stringify(pkg)).join("\n") + "\n"),
  )
  console.log(
    `Indexed MELPA: ${melpaPackages.length}, GNU ELPA: ${gnuPackages.length}, NonGNU ELPA: ${nongnuPackages.length}`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refreshArchiveSnapshot(process.cwd())
}
