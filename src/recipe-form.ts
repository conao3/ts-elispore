export type Form =
  | { kind: "symbol" | "string"; value: string }
  | { kind: "list"; value: Form[]; source: string }

export function readList(source: string) {
  const tokens = /\s+|;[^\r\n]*|[()]|"(?:\\[\s\S]|[^"\\])*"|[^\s();"\\]+/gy
  let cursor = 0
  function next() {
    while (cursor < source.length) {
      const start = cursor
      tokens.lastIndex = cursor
      const match = tokens.exec(source)
      if (!match) throw new Error(`Invalid recipe syntax at offset ${cursor}`)
      cursor = tokens.lastIndex
      if (!/^[\s;]/.test(match[0])) return { token: match[0], start }
    }
  }
  function read({ token, start }: NonNullable<ReturnType<typeof next>>): Form {
    if (token === "(") {
      const value: Form[] = []
      for (let part = next(); part; part = next()) {
        if (part.token === ")") return { kind: "list", value, source: source.slice(start, cursor) }
        value.push(read(part))
      }
      throw new Error("Unclosed recipe list")
    }
    if (token === ")") throw new Error("Unexpected close parenthesis")
    if (token.startsWith('"')) {
      return { kind: "string", value: token.slice(1, -1).replace(/\\([\s\S])/g, "$1") }
    }
    return { kind: "symbol", value: token }
  }
  const first = next()
  if (!first) throw new Error("Empty recipe")
  const form = read(first)
  if (form.kind !== "list") throw new Error("Expected a recipe list")
  return form.value
}
