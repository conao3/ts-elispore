import * as z from "zod"
export const entrySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  url: z.url().refine((u) => new URL(u).hostname === "github.com"),
  stars: z.number(),
  updated: z.string(),
  archived: z.boolean(),
  topics: z.array(z.string()),
  license: z.string().nullable(),
})
export const catalogSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.string()),
  entries: z.array(entrySchema),
})
export type Entry = z.infer<typeof entrySchema>
export function search(entries: Entry[], query: string, sort: string, archived: boolean) {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return entries
    .filter(
      (e) =>
        (archived || !e.archived) &&
        words.every((w) =>
          `${e.name} ${e.description} ${e.topics.join(" ")}`.toLocaleLowerCase().includes(w),
        ),
    )
    .sort((a, b) =>
      sort === "stars"
        ? b.stars - a.stars
        : sort === "updated"
          ? b.updated.localeCompare(a.updated)
          : a.name.localeCompare(b.name),
    )
}
