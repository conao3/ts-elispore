import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { publishedCatalog } from "./scripts/catalog-import.ts"
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
