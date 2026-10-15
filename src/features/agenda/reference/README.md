# Agenda — legacy reference (Step 1.3 extraction)

These 3 files are the original Step 1.3 extraction of App.jsx's `Agenda`
component: a single flat list writing to a placeholder `agenda` localStorage
shape, with AI conflict/impact analysis running on every add (`askClare` +
`buildSystemPrompt`).

**Not used by the app** as of Step 3.3 — `AgendaScreen.tsx`/`AgendaRoute.tsx`
one level up are the real, active screen, built against the actual
`tasks`/`calendar_items` tables (`05_DataModel.md` §2.3) per Step 3.3's
Master Prompt: manual CRUD only, no AI.

Kept here (not deleted) because the AI conflict-detection behavior these
files show (the `askClare` call analyzing impact/conflicts on every new
event) is exactly what Step 4.4's "AI conflict commentary" work needs to
reference/port from — see `03_MasterPrompts.md` Step 3.3 task: "Do not build
'AI conflict commentary' yet — leave a visual placeholder/TODO comment;
that requires Step 4's AI boundary."

Do not import from this folder in application code — it's a reference
snapshot, not a live module. Safe to delete once Step 4.4 has ported
whatever it needs from here.
