import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"
export default defineConfig({
  plugins: [react()],
  fmt: { semi: false, doubleQuote: true, sortPackageJson: false },
  lint: { ignorePatterns: ["dist/**", ".claude-dev/**"], categories: { correctness: "error" } },
  test: { include: ["src/**/*.test.ts"] },
  run: { tasks: { check: { command: "vp check && vp test" } } },
})
