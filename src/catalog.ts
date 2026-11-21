import * as z from "zod"
export const melpaRecipeSchema = z.object({
  name: z.string().regex(/^[a-zA-Z0-9@][a-zA-Z0-9@+_.-]*$/),
  fetcher: z.string().min(1),
  repo: z.string().min(1).optional(),
  url: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
  commit: z.string().min(1).optional(),
  files: z.string().optional(),
  lispDir: z.string().optional(),
})
export const entrySchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string(),
  url: z
    .url()
    .refine((u) => new URL(u).hostname === "github.com" && new URL(u).protocol === "https:"),
  stars: z.number(),
  updated: z.string(),
  archived: z.boolean(),
  topics: z.array(z.string()),
  license: z.string().nullable(),
  language: z.string().nullable().default(null),
  ownerType: z.enum(["User", "Organization"]).default("User"),
  melpaRecipes: z.array(melpaRecipeSchema).optional(),
})
export const catalogSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.string()),
  entries: z.array(entrySchema),
})
export type Entry = z.infer<typeof entrySchema>
