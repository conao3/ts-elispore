import { writeFileSync } from "node:fs"
import { pathToFileURL } from "node:url"
import * as z from "zod"
import { readList } from "../src/recipe-form.ts"
import { readStagedEntries, type StagedEntry } from "./catalog-import.ts"
import { api, repositoryField } from "./catalog.ts"

export function candidateDirectories(files?: string) {
  const directories = new Set(["", "lisp"])
  for (const form of files ? readList(files) : []) {
    if (form.kind !== "string") continue
    const parts = form.value.replace(/^(?:\.\/)+/, "").split("/")
    parts.pop()
    if (parts.some((part) => !part || part === ".." || /[*?[\]]/.test(part))) continue
    directories.add(parts.join("/"))
  }
  return [...directories]
}

const resultSchema = z.object({
  data: z.record(
    z.string(),
    z.record(z.string(), z.object({ __typename: z.string() }).nullable()).nullable(),
  ),
  errors: z
    .array(z.object({ type: z.literal("NOT_FOUND"), path: z.tuple([z.string()]) }))
    .optional(),
})

export function resolveDirectories(entries: StagedEntry[], query: (query: string) => unknown) {
  const resolved = new Map<string, string>()
  for (let start = 0; start < entries.length; start += 25) {
    const batch = entries.slice(start, start + 25).map(({ name, melpa }) => ({
      name,
      melpa,
      directories: candidateDirectories(melpa.files),
    }))
    const fields = batch.map(({ name, melpa, directories }, i) =>
      repositoryField(
        `r${i}`,
        name,
        directories
          .map((dir, index) => {
            const path = `${dir ? dir + "/" : ""}${melpa.name}.el`
            return `d${index}: object(expression: ${JSON.stringify(`${melpa.branch ?? "HEAD"}:${path}`)}) { __typename }`
          })
          .join("\n"),
      ),
    )
    const { data, errors } = resultSchema.parse(query(`{ ${fields.join("\n")} }`))
    const missing = new Set(errors?.map(({ path: [key] }) => key))
    for (const [i, { melpa, directories }] of batch.entries()) {
      const key = `r${i}`
      const result = data[key]
      if (result === null && missing.has(key)) continue
      if (!result || directories.some((_, index) => !(`d${index}` in result)))
        throw new Error(`Incomplete GitHub response for ${melpa.name}`)
      const found = directories.filter((_, index) => result[`d${index}`]?.__typename === "Blob")
      const depth = (dir: string) => (dir ? dir.split("/").length : 0)
      found.sort((a, b) => depth(a) - depth(b))
      const [first, second] = found
      if (first !== undefined && (second === undefined || depth(first) < depth(second))) {
        resolved.set(melpa.name, first)
      }
    }
  }
  return Object.fromEntries([...resolved].sort(([a], [b]) => a.localeCompare(b, "en")))
}

function lookup(query: string): unknown {
  try {
    return api("graphql", ["-f", `query=${query}`])
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "stdout" in cause &&
      typeof cause.stdout === "string"
    ) {
      try {
        const result: unknown = JSON.parse(cause.stdout)
        if (resultSchema.safeParse(result).success) return result
      } catch {
        throw cause
      }
    }
    throw cause
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const entries = readStagedEntries(process.cwd())
  const directories = resolveDirectories(entries, lookup)
  writeFileSync("examples/melpa-lisp-dirs.json", JSON.stringify(directories, null, 2) + "\n")
  const found = Object.values(directories)
  console.log(
    `Resolved ${found.filter(Boolean).length} subdirectories, ${found.filter((dir) => !dir).length} root paths, ${entries.length - found.length} unresolved`,
  )
}
