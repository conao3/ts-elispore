import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { catalogSchema } from "../src/catalog.ts"
import type { Entry } from "../src/catalog.ts"
import { publishedCatalog } from "./catalog-import.ts"

export function githubOnlyRepositories(entries: Entry[]): string[] {
  return [
    ...new Set(
      entries
        .filter((entry) => entry.sources?.length === 1 && entry.sources[0] === "github")
        .map((entry) => entry.name),
    ),
  ].sort()
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd()
  const directory = join(root, "checker/target")
  mkdirSync(directory, { recursive: true })
  const list = join(directory, "github-list.txt")
  const catalog = catalogSchema.parse(JSON.parse(publishedCatalog(root)))
  const repositories = githubOnlyRepositories(catalog.entries)
  writeFileSync(list, repositories.join("\n") + "\n")
  console.log(`GitHub-only catalog entries: ${repositories.length}`)
  const result = spawnSync(
    "cargo",
    [
      "run",
      "--release",
      "--manifest-path",
      "checker/Cargo.toml",
      "--",
      "--source",
      "melpa,gnu-elpa,nongnu-elpa,github",
      "--github-list",
      list,
      "--cache",
      "public/checks.json",
      "--output",
      "public/checks.json",
      ...process.argv.slice(2),
    ],
    { cwd: root, env: { ...process.env, LEANFRAN_OFFLINE: "1" }, stdio: "inherit" },
  )
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
