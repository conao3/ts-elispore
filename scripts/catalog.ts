import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import * as z from "zod"
import { catalogSchema } from "../src/catalog.ts"
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
  topics: z.array(z.string()).default([]),
  license: z.object({ spdx_id: z.string() }).nullable(),
})
function api(path: string): unknown {
  return JSON.parse(
    execFileSync("gh", ["api", path], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }),
  )
}
const queries = [
  'language:"Emacs Lisp" stars:>=20 fork:false',
  "topic:emacs-package fork:false",
  'language:"Emacs Lisp" pushed:>2026-01-01 fork:false',
]
const all = new Map<number, z.infer<typeof repo>>()
for (const q of queries) {
  const result = z
    .object({ items: z.array(repo) })
    .parse(
      api(
        `search/repositories?${new URLSearchParams({ q, per_page: "100", sort: q.includes("pushed") ? "updated" : "stars" })}`,
      ),
    )
  for (const r of result.items) all.set(r.id, r)
}
for (const name of ["conao3/leaner-ts-mode.el"]) {
  const r = repo.parse(api(`repos/${name}`))
  all.set(r.id, r)
}
const entries = [...all.values()]
  .filter(
    (r) =>
      !/(?:dotfiles|emacs[.-]d|doomemacs|spacemacs|prelude|configuration|purcell\/emacs\.d)/i.test(
        r.full_name,
      ),
  )
  .map((r) => ({
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
  }))
  .sort((a, b) => a.name.localeCompare(b.name))
const data = catalogSchema.parse({
  generatedAt: new Date().toISOString(),
  sources: queries,
  entries,
})
writeFileSync("public/catalog.json", JSON.stringify(data, null, 2) + "\n")
console.log(`Indexed ${entries.length} GitHub repositories`)
