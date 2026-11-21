import { expect, test } from "vite-plus/test"
import { hasPackageFiles, isPackageCandidate } from "../scripts/catalog"

test("accepts package files at the root or in lisp", () => {
  const tree = { entries: [{ name: "package.el", type: "blob" }] }
  expect(hasPackageFiles({ root: tree, lisp: null })).toBe(true)
  expect(hasPackageFiles({ root: null, lisp: tree })).toBe(true)
})

test("rejects empty trees, non-Lisp files, and directories named like Lisp files", () => {
  expect(hasPackageFiles({ root: null, lisp: null })).toBe(false)
  expect(hasPackageFiles({ root: { entries: [] }, lisp: {} })).toBe(false)
  expect(
    hasPackageFiles({
      root: {
        entries: [
          { name: "README.md", type: "blob" },
          { name: "fake.el", type: "tree" },
        ],
      },
      lisp: null,
    }),
  ).toBe(false)
})

test("rejects malformed tree responses instead of silently dropping repositories", () => {
  expect(() => hasPackageFiles(undefined)).toThrow()
  expect(() => hasPackageFiles({ root: { entries: "invalid" }, lisp: null })).toThrow()
})

test("excludes mirrors, forks, and configuration distributions", () => {
  const candidate = { full_name: "minad/vertico", fork: false, topics: [] }
  expect(isPackageCandidate(candidate)).toBe(true)
  expect(isPackageCandidate({ ...candidate, topics: ["mirror"] })).toBe(false)
  expect(isPackageCandidate({ ...candidate, topics: ["style-guide"] })).toBe(false)
  expect(isPackageCandidate({ ...candidate, topics: ["styleguide"] })).toBe(false)
  expect(isPackageCandidate({ ...candidate, fork: true })).toBe(false)
  for (const full_name of ["qjcg/awesome-typst", "emacs-mirror/emacs", "remacs/remacs"]) {
    expect(isPackageCandidate({ ...candidate, full_name })).toBe(false)
  }
  expect(isPackageCandidate({ ...candidate, full_name: "someone/emacs-theme" })).toBe(true)
  expect(isPackageCandidate({ ...candidate, full_name: "someone/dotfiles" })).toBe(false)
})
