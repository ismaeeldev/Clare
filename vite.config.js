import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Must mirror the "@/*" path in tsconfig.json — tsc and Vite resolve
      // aliases independently, both need to agree.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // `vercel dev` sert les fonctions /api ; en `vite dev` seul, /api n'existe pas.
    port: 5173,
  },
});
