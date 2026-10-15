# Historique — legacy reference (Step 1.3 extraction)

These 3 files are the original Step 1.3 extraction of App.jsx's
`Historique` component: placeholder journal data (`journal: []` passed in
by the route wrapper), a raw-SVG 30-day energy sparkline, filterable list.

**Not used by the app** as of Step 3.4 — the real journal history view now
lives at `src/features/journal/JournalHistoryScreen.tsx` (routed at
`/historique`), built against the actual `journal_entries`/
`finance_entries` tables with a Recharts trend chart, finance totals, a
quick finance-add widget, and a JSON export action — matching Step 3.4's
Master Prompt task 5 exactly.

Kept here (not deleted) only for reference on the original's exact 30-day
sparkline math/visual treatment, in case that specific presentation is
wanted again later. Do not import from this folder in application code —
excluded from `tsconfig.json`/`eslint.config.js` like
`src/features/agenda/reference/`. Safe to delete whenever.
