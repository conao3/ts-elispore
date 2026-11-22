import { describe, expect, it } from "vite-plus/test"
import { applicableRules, checkScore, checksSchema, entryChecks } from "./checks"
import type { PackageCheck } from "./checks"
import type { Entry } from "./catalog"

const entry: Entry = {
  id: 1,
  name: "owner/repo",
  description: "",
  url: "https://github.com/owner/repo",
  topics: [],
  license: null,
  language: null,
  sources: ["github"],
}
const report = checksSchema.parse({
  version: 2,
  generatedAt: "2026-11-21T00:00:00Z",
  rules: [
    {
      id: "main-file",
      title: "Main file",
      description: "Has main file",
      level: "required",
      sources: [{ label: "Doc: section", url: "https://example.org/main", quote: "Quote." }],
    },
    {
      id: "footer",
      title: "Footer",
      description: "Has footer",
      level: "required",
      sources: [{ label: "Doc: section", url: "https://example.org/footer", quote: "Quote." }],
    },
    {
      id: "mz-advice",
      title: "Advice",
      description: "",
      level: "advice",
      sources: [{ label: "Doc: section", url: "https://example.org/advice", quote: "Quote." }],
    },
    {
      id: "license-file",
      title: "License file",
      description: "Has license file",
      level: "required",
      sources: [{ label: "Doc: section", url: "https://example.org/license", quote: "Quote." }],
    },
  ],
  results: {
    "melpa/pkg": { version: "1", failed: ["footer", "mz-advice"], skipped: ["license-file"] },
    "gnu-elpa/pkg": { version: "2", failed: [], skipped: ["license-file"] },
    "github/owner/repo": { version: "etag", failed: [], error: "Unavailable" },
  },
})

describe("package checks", () => {
  it("maps each archive package, not the repository or recipe name", () => {
    const packages = entryChecks(
      {
        ...entry,
        sources: ["github", "melpa", "gnu-elpa"],
        archives: [
          { source: "melpa", name: "pkg" },
          { source: "gnu-elpa", name: "pkg" },
          { source: "melpa", name: "pkg" },
          { source: "melpa", name: "missing" },
        ],
      },
      report,
    )
    expect(packages.map((pkg) => pkg.key)).toEqual(["melpa/pkg", "gnu-elpa/pkg"])
    expect(checkScore(packages, report.rules)).toEqual({ passed: 1, total: 2 })
    expect(checkScore(packages.toReversed(), report.rules)).toEqual({ passed: 1, total: 2 })
  })
  it("selects the first successful package in source order", () => {
    const packages: PackageCheck[] = ["github", "nongnu-elpa", "gnu-elpa", "melpa"].map(
      (source, index) => ({
        key: `${source}/pkg`,
        source: source as PackageCheck["source"],
        name: "pkg",
        version: "1",
        failed: index % 2 ? ["footer"] : [],
        skipped: ["license-file"],
      }),
    )
    for (const source of ["melpa", "gnu-elpa", "nongnu-elpa", "github"]) {
      const expected = packages.find((pkg) => pkg.source === source)
      expect(checkScore(packages, report.rules)).toEqual({
        passed: expected?.failed.length ? 1 : 2,
        total: 2,
      })
      if (expected) expected.error = "Unavailable"
    }
    expect(checkScore(packages, report.rules)).toBeNull()
  })
  it("maps GitHub-only entries and never scores fetch errors", () => {
    const packages = entryChecks(entry, report)
    expect(packages[0]?.key).toBe("github/owner/repo")
    expect(packages[0]?.error).toBe("Unavailable")
    expect(checkScore(packages, report.rules)).toBeNull()
    expect(
      checkScore(
        [
          ...packages,
          ...entryChecks({ ...entry, archives: [{ source: "gnu-elpa", name: "pkg" }] }, report),
        ],
        report.rules,
      ),
    ).toEqual({ passed: 2, total: 2 })
  })
  it("handles unloaded, unchecked and empty data", () => {
    expect(entryChecks(entry, null)).toEqual([])
    expect(entryChecks({ ...entry, name: "missing" }, report)).toEqual([])
    expect(entryChecks({ ...entry, sources: ["github", "melpa"] }, report)).toEqual([])
    expect(checkScore([], report.rules)).toBeNull()
    expect(checkScore(entryChecks(entry, report), [])).toBeNull()
  })
  it("scores only applicable required rules", () => {
    const [melpa] = entryChecks({ ...entry, archives: [{ source: "melpa", name: "pkg" }] }, report)
    expect(checkScore([melpa!], report.rules)).toEqual({ passed: 1, total: 2 })
    expect(checkScore([{ ...melpa!, skipped: [] }], report.rules)).toEqual({ passed: 2, total: 3 })
    expect(applicableRules(melpa, report.rules, "advice").map((rule) => rule.id)).toEqual([
      "mz-advice",
    ])
  })
  it("rejects invalid reports, unknown failures and duplicate IDs", () => {
    expect(checksSchema.safeParse({ ...report, generatedAt: "yesterday" }).success).toBe(false)
    expect(
      checksSchema.safeParse({ ...report, results: { bad: { version: "1", failed: ["unknown"] } } })
        .success,
    ).toBe(false)
    expect(
      checksSchema.safeParse({ ...report, rules: [report.rules[0], report.rules[0]] }).success,
    ).toBe(false)
    expect(
      checksSchema.safeParse({ ...report, results: { bad: { version: 1, failed: [] } } }).success,
    ).toBe(false)
    expect(
      checksSchema.safeParse({
        ...report,
        results: { bad: { version: "1", failed: [], skipped: ["unknown"] } },
      }).success,
    ).toBe(false)
    expect(
      checksSchema.safeParse({ ...report, rules: [{ ...report.rules[0], level: "other" }] })
        .success,
    ).toBe(false)
    expect(
      checksSchema.safeParse({ ...report, rules: [{ ...report.rules[0], sources: [] }] }).success,
    ).toBe(false)
  })
})
