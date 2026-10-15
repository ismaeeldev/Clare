import { fetchEntries, fetchFinanceEntries } from "@/lib/journalRepo";

/**
 * exportData — Step 3.4 task 7's first pass at "Export my data"
 * (CLA-FR-023). Covers only journal_entries + finance_entries (the two
 * tables that exist so far); the full multi-table export is completed in
 * Step 9.3 once every table exists. Client-side JSON download — no server
 * round-trip beyond the same reads the app already does.
 */
export async function exportJournalAndFinanceData(userId: string): Promise<void> {
  const [journalEntries, financeEntries] = await Promise.all([fetchEntries(userId, 10000), fetchFinanceEntries(userId, 10000)]);

  const payload = {
    exported_at: new Date().toISOString(),
    note: "Export partiel (journal + finances). L'export complet arrive à l'étape 9.",
    journal_entries: journalEntries,
    finance_entries: financeEntries,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clare-export-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
