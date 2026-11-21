import { expect, test } from "vite-plus/test"
import { normalizeTopic } from "./topics"

test("normalizes case, the Emacs prefix and trailing plurals", () => {
  expect(normalizeTopic("EMACS-PACKAGES")).toBe("package")
  expect(normalizeTopic("actions")).toBe("action")
  expect(normalizeTopic("org-mode")).toBe("org-mode")
  expect(normalizeTopic("python")).toBe("python")
  expect(normalizeTopic("")).toBe("")
})

test("folds theme and major-mode variants", () => {
  for (const topic of [
    "theme",
    "themes",
    "emacs-theme",
    "emacs-themes",
    "dark-theme",
    "color-theme",
    "light-themes",
  ]) {
    expect(normalizeTopic(topic)).toBe("theme")
  }
  for (const topic of ["mode", "emacs-mode", "modes", "major-mode", "emacs-major-modes"]) {
    expect(normalizeTopic(topic)).toBe("major-mode")
  }
})

test("preserves ss endings, short names and emacs", () => {
  for (const topic of ["css", "ess", "class", "chess", "emacs", "s", "as", "js"]) {
    expect(normalizeTopic(topic)).toBe(topic)
    expect(normalizeTopic(topic.toUpperCase())).toBe(topic)
  }
  expect(normalizeTopic("emacs-css")).toBe("css")
  expect(normalizeTopic("emacs-ess")).toBe("ess")
  expect(normalizeTopic("tags")).toBe("tag")
})
