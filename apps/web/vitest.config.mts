import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Khớp `paths` trong tsconfig — Vitest không đọc tsconfig paths.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // e2e/ thuộc Playwright — để Vitest gom vào thì nó sẽ cố chạy và fail khó hiểu.
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
  },
});
