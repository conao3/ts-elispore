import * as z from "zod"
import type { Entry, Source } from "./catalog"

export const checksSchema = z
  .object({
    version: z.number().int().positive(),
    generatedAt: z.iso.datetime({ offset: true }),
    rules: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string(),
        description: z.string(),
        level: z.enum(["required", "advice"]),
        sources: z
          .array(z.object({ label: z.string().min(1), url: z.url(), quote: z.string().min(1) }))
          .min(1),
      }),
    ),
    results: z.record(
      z.string(),
      z.object({
        version: z.string(),
        failed: z.array(z.string()),
        skipped: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
    ),
  })
  .superRefine((report, context) => {
    const ids = new Set(report.rules.map((rule) => rule.id))
    if (ids.size !== report.rules.length)
      context.addIssue({ code: "custom", message: "Duplicate rule IDs" })
    for (const result of Object.values(report.results)) {
      if ([...result.failed, ...(result.skipped ?? [])].some((id) => !ids.has(id)))
        context.addIssue({ code: "custom", message: "Unknown rule in result" })
    }
  })

export type Checks = z.infer<typeof checksSchema>
export type PackageCheck = Checks["results"][string] & { key: string; source: Source; name: string }

export function entryChecks(entry: Entry, report: Checks | null): PackageCheck[] {
  if (!report) return []
  const packages: { source: Source; name: string; key: string }[] = entry.archives?.length
    ? entry.archives.map(({ source, name }) => ({ source, name, key: `${source}/${name}` }))
    : entry.sources?.length === 1 && entry.sources[0] === "github"
      ? [{ source: "github", name: entry.name, key: `github/${entry.name}` }]
      : []
  return [...new Map(packages.map((pkg) => [pkg.key, pkg])).values()].flatMap((pkg) => {
    const result = report.results[pkg.key]
    return result ? [{ ...pkg, ...result }] : []
  })
}

export function applicableRules(
  pkg: PackageCheck | undefined,
  rules: Checks["rules"],
  level: Checks["rules"][number]["level"],
) {
  if (!pkg) return []
  return rules.filter((rule) => rule.level === level && !pkg.skipped?.includes(rule.id))
}

export function checkScore(packages: PackageCheck[], rules: Checks["rules"]) {
  const primary = (["melpa", "gnu-elpa", "nongnu-elpa", "github"] as const)
    .map((source) => packages.find((pkg) => pkg.source === source && pkg.error === undefined))
    .find((pkg) => pkg !== undefined)
  const required = applicableRules(primary, rules, "required")
  if (!primary || !required.length) return null
  const passed = required.filter((rule) => !primary.failed.includes(rule.id)).length
  return { passed, total: required.length }
}
