import { describe, expect, it } from "vite-plus/test"
import { githubOnlyRepositories } from "../scripts/checks.ts"
import type { Entry } from "./catalog.ts"

function entry(name: string, sources?: Entry["sources"]): Entry {
  return {
    id: 1,
    name,
    sources,
    description: "",
    url: "https://github.com/" + name,
    topics: [],
    license: null,
    language: "Emacs Lisp",
  }
}

describe("checker GitHub inputs", () => {
  it("uses exact catalog names and excludes archive-backed entries", () => {
    expect(
      githubOnlyRepositories([
        entry("Zed/emacs-Thing.el", ["github"]),
        entry("alice/thing", ["github"]),
        entry("alice/thing", ["github"]),
        entry("archive/thing", ["github", "melpa"]),
        entry("gnu/thing", ["gnu-elpa"]),
        entry("unknown/thing"),
      ]),
    ).toEqual(["Zed/emacs-Thing.el", "alice/thing"])
  })
  it("accepts an empty catalog", () => {
    expect(githubOnlyRepositories([])).toEqual([])
  })
})
