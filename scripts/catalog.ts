import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import * as z from "zod"
import { catalogSchema, entrySchema } from "../src/catalog.ts"
import { refreshArchiveSnapshot } from "./package-archives.ts"
const repo = z.object({
  id: z.number(),
  full_name: z.string(),
  language: z.string().nullable(),
  owner: z.object({ type: z.enum(["User", "Organization"]) }),
  description: z.string().nullable(),
  html_url: z.string(),
  stargazers_count: z.number(),
  pushed_at: z.string(),
  archived: z.boolean(),
  fork: z.boolean(),
  topics: z.array(z.string()).default([]),
  license: z.object({ spdx_id: z.string() }).nullable(),
})
export function api(path: string, args: string[] = []): unknown {
  return JSON.parse(
    execFileSync("gh", ["api", path, ...args], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  )
}
export function repositoryField(alias: string, repository: string, fields: string) {
  const [owner, name] = repository.split("/")
  return `${alias}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
    ${fields}
  }`
}
export function githubCatalogEntry(value: unknown) {
  const r = repo.parse(value)
  return entrySchema.parse({
    id: r.id,
    name: r.full_name,
    description: r.description ?? "",
    url: r.html_url,
    stars: r.stargazers_count,
    updated: r.pushed_at,
    archived: r.archived,
    topics: r.topics,
    license: r.license?.spdx_id ?? null,
    language: r.language,
    ownerType: r.owner.type,
  })
}
const discovery = [
  { q: 'language:"Emacs Lisp" stars:>=20 fork:false', pages: 4 },
  { q: "topic:emacs-package fork:false", pages: 2 },
  { q: 'language:"Emacs Lisp" pushed:>2026-01-01 fork:false', pages: 2 },
  ...["emacs-packages", "emacs-theme", "emacs-mode", "org-mode", "melpa"].map((topic) => ({
    q: `topic:${topic} fork:false`,
    pages: 1,
  })),
]
const treeSchema = z
  .object({ entries: z.array(z.object({ name: z.string(), type: z.string() })).optional() })
  .nullable()
export const packageTreesSchema = z.object({ root: treeSchema, lisp: treeSchema })
export function hasPackageFiles(value: unknown): boolean {
  const trees = packageTreesSchema.parse(value)
  return [trees.root, trees.lisp].some((tree) =>
    tree?.entries?.some((entry) => entry.type === "blob" && entry.name.endsWith(".el")),
  )
}
export function isPackageCandidate(r: {
  full_name: string
  fork: boolean
  topics: string[]
}): boolean {
  return (
    !r.fork &&
    !/^(?:awesome-.*|emacs|remacs)$/i.test(r.full_name.split("/")[1]) &&
    !r.topics.some((topic) => ["mirror", "style-guide", "styleguide"].includes(topic)) &&
    !/(?:dotfiles|emacs[.-]d|doomemacs|spacemacs|prelude|configuration|purcell\/emacs\.d)/i.test(
      r.full_name,
    )
  )
}
function refresh() {
  const all = new Map<number, z.infer<typeof repo>>()
  for (const { q, pages } of discovery) {
    for (let page = 1; page <= pages; page++) {
      const result = z
        .object({ items: z.array(repo) })
        .parse(
          api(
            `search/repositories?${new URLSearchParams({ q, per_page: "100", page: String(page), sort: q.includes("pushed") ? "updated" : "stars" })}`,
          ),
        )
      for (const r of result.items) all.set(r.id, r)
      if (result.items.length < 100) break
    }
  }
  for (const name of ["conao3/leaner-ts-mode.el"]) {
    const r = repo.parse(api(`repos/${name}`))
    all.set(r.id, r)
  }
  const candidates = [...all.values()].filter(isPackageCandidate)
  const packages: z.infer<typeof repo>[] = []
  for (let start = 0; start < candidates.length; start += 25) {
    const batch = candidates.slice(start, start + 25)
    const fields = batch.map((r, i) =>
      repositoryField(
        `r${i}`,
        r.full_name,
        `
      root: object(expression: "HEAD:") { ... on Tree { entries { name type } } }
      lisp: object(expression: "HEAD:lisp") { ... on Tree { entries { name type } } }
    `,
      ),
    )
    const result = z
      .object({ data: z.record(z.string(), packageTreesSchema), errors: z.never().optional() })
      .parse(api("graphql", ["-f", `query={ ${fields.join("\n")} }`]))
    for (const [i, r] of batch.entries()) {
      if (hasPackageFiles(result.data[`r${i}`])) packages.push(r)
    }
  }
  const entries = packages.map(githubCatalogEntry).sort((a, b) => a.name.localeCompare(b.name))
  const data = catalogSchema.parse({
    generatedAt: new Date().toISOString(),
    sources: discovery.map(({ q }) => q),
    entries,
  })
  writeFileSync("public/catalog.json", JSON.stringify(data, null, 2) + "\n")
  console.log(`Indexed ${entries.length} GitHub repositories`)
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await refreshArchiveSnapshot(process.cwd())
  refresh()
}
