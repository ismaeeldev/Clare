import type { Config } from "tailwindcss";

/**
 * Tailwind v4 note: theme tokens (colors, fonts, spacing, radius, shadows)
 * are defined CSS-first via the @theme block in src/styles/globals.css,
 * populated in Step 1.1 from docs/02_ThemeGuideline.md. This file exists for
 * content scanning and any future JS-based plugin config — do not add color/
 * font/spacing values here, they belong in globals.css's @theme block so
 * there is exactly one source of truth.
 */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config;
