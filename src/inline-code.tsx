export function InlineCode({ text }: { text: string }) {
  return text
    .split(/(`[^`]+`)/)
    .map((part, index) =>
      part.length > 2 && part.startsWith("`") && part.endsWith("`") ? (
        <code key={index}>{part.slice(1, -1)}</code>
      ) : (
        part
      ),
    )
}
