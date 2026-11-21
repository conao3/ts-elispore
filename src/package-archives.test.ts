import { expect, test } from "vite-plus/test"
import { parseElpa, parseMelpa } from "../scripts/package-archives"
import { mergeCatalog } from "../scripts/catalog-import"
import { installationExample } from "./snippet"
import type { Entry } from "./catalog"

test("reads ELPA vectors without evaluating Lisp or requiring repository URLs", () => {
  const packages = parseElpa(
    '(1 ; format version\n (demo . [(1 2) ((emacs (27))) "Summary\\" inside" tar ((:url . "https://codeberg.org/owner/demo"))]) (other . [(2) nil "Other" tar]))',
    "gnu-elpa",
  )
  expect(packages).toEqual([
    {
      name: "demo",
      source: "gnu-elpa",
      summary: 'Summary" inside',
      version: "1.2",
      url: "https://codeberg.org/owner/demo",
      gitUrl: "https://codeberg.org/owner/demo",
    },
    {
      name: "other",
      source: "gnu-elpa",
      summary: "Other",
      version: "2",
      url: "https://elpa.gnu.org/packages/other.html",
    },
  ])
  expect(() => parseElpa('(progn (message "not data"))', "nongnu-elpa")).toThrow()
  expect(() => parseElpa('(1) (message "trailing")', "nongnu-elpa")).toThrow()
})

test("includes unbuilt MELPA recipes and distinguishes Git from Mercurial", () => {
  const records = parseMelpa(
    {
      "git-demo": { fetcher: "sourcehut", repo: "owner/demo", branch: "stable" },
      "hg-demo": { fetcher: "hg", url: "https://hg.sr.ht/~owner/demo" },
    },
    { "git-demo": { desc: "Example", ver: [2, 1] } },
  )
  expect(records[0]).toMatchObject({
    name: "git-demo",
    gitUrl: "https://git.sr.ht/~owner/demo",
    version: "2.1",
  })
  expect(records[1]).toMatchObject({ name: "hg-demo", source: "melpa" })
  expect(records[1].gitUrl).toBeUndefined()
  const [git, hg] = mergeCatalog(
    { generatedAt: "now", entries: [], sources: [] },
    [],
    {},
    records,
  ).entries
  expect(installationExample(git, "leaf", [], "vc").code).toBe(
    '(leaf git-demo\n  :vc (:url "https://git.sr.ht/~owner/demo" :branch "stable"))',
  )
  expect(installationExample(hg, "leaf", [], "vc")).toEqual({
    code: null,
    note: "This package uses hg; :vc requires Git.",
    hasArchive: false,
  })
})

test("deduplicates exact package names across archives and preserves GitHub discovery metadata", () => {
  const discovery: Entry = {
    id: 7,
    name: "owner/repo",
    url: "https://github.com/owner/repo",
    description: "Discovery",
    stars: 80,
    updated: "",
    archived: false,
    topics: [],
    license: null,
    ownerType: "User",
    language: null,
  }
  const packages = parseMelpa(
    { demo: { fetcher: "github", repo: "owner/repo" } },
    { demo: { desc: "Archive", ver: [1] } },
  )
  const { entries } = mergeCatalog(
    { generatedAt: "now", entries: [discovery], sources: [] },
    [],
    {},
    [
      ...packages,
      { name: "demo", source: "gnu-elpa" },
      { name: "demo", source: "nongnu-elpa" },
      { name: "no-vcs", source: "gnu-elpa" },
    ],
  )
  expect(entries).toHaveLength(2)
  expect(entries[1]).toMatchObject({
    ...discovery,
    sources: ["github", "melpa", "gnu-elpa", "nongnu-elpa"],
  })
  expect(
    installationExample({ ...entries[1], url: "https://github.com/owner/other" }, "leaf", [], "vc")
      .code,
  ).toBe('(leaf demo\n  :vc (:url "https://github.com/owner/repo"))')
  expect(installationExample(entries[0], "use-package", [], "vc")).toEqual({
    code: null,
    note: "No Git repository URL is available for :vc.",
    hasArchive: true,
  })
  expect(installationExample(entries[0], "use-package", [], "archive").code).toBe(
    "(use-package no-vcs\n  :ensure t)",
  )
})
