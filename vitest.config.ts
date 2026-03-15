import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./app/test/setup.ts"],
    globals: true,
    exclude: ["tests/e2e/**", "**/node_modules/**", "**/.git/**"]
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url))
    }
  }
})
