import type { ReactNode } from "react";

/**
 * FieldLabel — the uppercase section-label pattern repeated ~15 times
 * verbatim in the original ProfilSetup (e.g. line 637, 654, 662, 675...).
 * Factored into one component per docs/08_CodingStandards.md's reuse rule —
 * same visual result, no behavior change.
 */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-2 block text-label font-bold uppercase tracking-[0.07em] text-meta">
      {children}
    </label>
  );
}
