import { defineConfig } from "vite-plus"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
export default defineConfig({
  plugins: [react(), tailwindcss()],
  fmt: { semi: false, doubleQuote: true, sortPackageJson: false },
  lint: {
    ignorePatterns: ["dist/**", ".claude-dev/**"],
    categories: { correctness: "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: { include: ["src/**/*.test.ts"] },
  run: { tasks: { check: { command: "vp check && vp test" } } },
})
