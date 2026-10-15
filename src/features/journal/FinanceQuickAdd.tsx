import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { InlineError } from "@/components/ui/InlineError";
import { addFinanceEntry, type FinanceEntryRow } from "@/lib/journalRepo";
import { todayKey } from "@/lib/dateUtils";
import { ApiTimeoutError } from "@/lib/apiClient";

/**
 * FinanceQuickAdd — Step 3.4 task 6: a standalone "Add revenue/expense"
 * quick action, separate from the daily journal entry's own
 * revenue/expenses fields — this is for logging a one-off amount without
 * writing a full journal entry (e.g. an invoice paid mid-afternoon).
 * Validated currency/decimal format per CLA-FR-013 (two-decimal numeric,
 * rejects non-numeric input via the native number input's own validation
 * plus an explicit finite-number check before submit).
 */
export function FinanceQuickAdd({ userId, onAdded }: { userId: string; onAdded?: (entry: FinanceEntryRow) => void }) {
  const [type, setType] = useState<"revenue" | "expense">("revenue");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleAdd = async () => {
    const parsed = Number(amount);
    if (!amount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError("Entre un montant valide.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const entry = await addFinanceEntry(userId, {
        entry_date: todayKey(),
        amount: Math.round(parsed * 100) / 100,
        type,
        note: note.trim() || undefined,
      });
      onAdded?.(entry);
      setAmount("");
      setNote("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err) {
      setError(err instanceof ApiTimeoutError ? "L'ajout prend trop de temps. Vérifie ta connexion et réessaie." : "L'ajout a échoué.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <p className="mb-2.5 text-label font-bold uppercase tracking-[0.07em] text-meta">Ajout rapide</p>
      <div className="mb-2.5 flex gap-1.5">
        <button
          type="button"
          onClick={() => setType("revenue")}
          className={`flex-1 cursor-pointer rounded-[8px] border-none px-3 py-2 font-ui text-xs font-bold ${type === "revenue" ? "bg-green-solid text-white" : "bg-bg text-text-mid"}`}
        >
          💰 Revenu
        </button>
        <button
          type="button"
          onClick={() => setType("expense")}
          className={`flex-1 cursor-pointer rounded-[8px] border-none px-3 py-2 font-ui text-xs font-bold ${type === "expense" ? "bg-red-solid text-white" : "bg-bg text-text-mid"}`}
        >
          💶 Dépense
        </button>
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00 €"
          aria-label="Montant"
          className="w-28 rounded-sm border border-border bg-bg px-2.5 py-2 text-[16px] font-extrabold text-text outline-none focus:border-navy"
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optionnel)"
          aria-label="Note"
          className="flex-1 rounded-sm border border-border bg-bg px-2.5 py-2 text-body-sm text-text outline-none focus:border-navy"
        />
      </div>
      {error && (
        <div className="mt-2">
          <InlineError message={error} onRetry={handleAdd} />
        </div>
      )}
      {success && <p className="mt-2 text-body-sm font-semibold text-green-text">Ajouté ✓</p>}
      <Button variant="primary" size="sm" onClick={handleAdd} disabled={saving} className="mt-2.5 w-full">
        {saving ? "Ajout..." : "Ajouter"}
      </Button>
    </Card>
  );
}
