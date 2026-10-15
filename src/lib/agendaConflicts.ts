import type { CalendarItem } from "@/lib/agendaRepo";

/**
 * Deterministic overlap detection for AgendaScreen's conflict chip
 * (04_ApplicationFlow.md §2.5). Pure comparison, no AI — matches this app's
 * rule that AI never invents/computes a fact a plain calculation can
 * establish; the AI (agenda-conflict Edge Function) only supplies the
 * read-only suggestion TEXT once an overlap here has already been found.
 * Cancelled items never conflict with anything (they're not really "on"
 * the agenda), and an item never conflicts with itself.
 */
export function findOverlappingIds(items: CalendarItem[]): Set<string> {
  const active = items.filter((i) => i.status !== "cancelled");
  const overlapping = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    const a = active[i];
    const aStart = new Date(a.starts_at).getTime();
    const aEnd = a.ends_at ? new Date(a.ends_at).getTime() : aStart;
    for (let j = i + 1; j < active.length; j++) {
      const b = active[j];
      const bStart = new Date(b.starts_at).getTime();
      const bEnd = b.ends_at ? new Date(b.ends_at).getTime() : bStart;
      // Two intervals overlap iff each starts before the other ends. A
      // zero-duration item (no ends_at) still "overlaps" another item whose
      // span contains that start instant.
      const overlaps = aStart < (bEnd || bStart + 1) && bStart < (aEnd || aStart + 1);
      if (overlaps) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return overlapping;
}
