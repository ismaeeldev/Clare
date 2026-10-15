import type { CalendarItem, Task } from "@/lib/agendaRepo";

/**
 * Agenda screen types — Step 3.3, built against the real `tasks`/
 * `calendar_items` tables (docs/05_DataModel.md §2.3). Unlike the legacy
 * (Step 1.3) AgendaScreen this replaces, there's no single flat "event"
 * shape here — calendar_items (dated appointments) and tasks (undated or
 * due-dated to-dos) are genuinely different domain objects with different
 * fields, matching the real schema rather than flattening them together.
 */
export interface AgendaScreenProps {
  userId: string;
}

export type { CalendarItem, Task };
