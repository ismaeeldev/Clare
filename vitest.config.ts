import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    // The default "forks" pool times out spawning workers under this
    // project's path (contains a space — "WEB DEV" — which forks mishandles
    // on Windows); "threads" doesn't fork a subprocess so it's unaffected.
    pool: "threads",
  },
});
