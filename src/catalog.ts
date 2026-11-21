import * as z from "zod"
export const archiveSourceSchema = z.enum(["melpa", "gnu-elpa", "nongnu-elpa"])
export const sourceSchema = z.enum(["github", ...archiveSourceSchema.options])
export type Source = z.infer<typeof sourceSchema>
export const sourceLabels: Record<Source, string> = {
  github: "GitHub search",
  melpa: "MELPA",
  "gnu-elpa": "GNU ELPA",
  "nongnu-elpa": "NonGNU ELPA",
}
export const packageNameSchema = z.string().regex(/^[a-zA-Z0-9@][a-zA-Z0-9@+_.-]*$/)
const webUrl = z.url().refine((value) => ["https:", "http:"].includes(new URL(value).protocol))
export const archivePackageSchema = z.object({
  name: packageNameSchema,
  source: archiveSourceSchema,
  summary: z.string().optional(),
  version: z.string().optional(),
  url: webUrl.optional(),
  gitUrl: z.string().optional(),
})
export type ArchivePackage = z.infer<typeof archivePackageSchema>
export const melpaRecipeSchema = z.object({
  name: packageNameSchema,
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
  url: webUrl,
  stars: z.number(),
  updated: z.string(),
  archived: z.boolean(),
  topics: z.array(z.string()),
  license: z.string().nullable(),
  language: z.string().nullable().default(null),
  ownerType: z.enum(["User", "Organization"]).default("User"),
  melpaRecipes: z.array(melpaRecipeSchema).optional(),
  archives: z.array(archivePackageSchema).optional(),
  sources: z.array(sourceSchema).optional(),
})
export const catalogSchema = z.object({
  generatedAt: z.string(),
  sources: z.array(z.string()),
  entries: z.array(entrySchema),
})
export type Entry = z.infer<typeof entrySchema>
