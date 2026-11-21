import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { publishedCatalog } from "./scripts/catalog-import.ts"
import { copyFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "elispore-about-page",
      writeBundle(options) {
        if (!options.dir) throw new Error("Expected a build output directory")
        const directory = join(options.dir, "about")
        mkdirSync(directory, { recursive: true })
        copyFileSync(join(options.dir, "index.html"), join(directory, "index.html"))
      },
    },
    {
      name: "elispore-catalog",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url?.split("?")[0] !== "/catalog.json") return next()
          try {
            const catalog = publishedCatalog(server.config.root)
            response.setHeader("Content-Type", "application/json")
            response.end(catalog)
          } catch (error) {
            next(error)
          }
        })
      },
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "catalog.json",
          source: publishedCatalog(process.cwd()),
        })
      },
    },
  ],
  fmt: { semi: false, doubleQuote: true, sortPackageJson: false },
  lint: {
    ignorePatterns: ["dist/**", ".claude-dev/**"],
    categories: { correctness: "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: { include: ["src/**/*.test.ts"] },
  run: { tasks: { check: { command: "vp check && vp test" } } },
})
