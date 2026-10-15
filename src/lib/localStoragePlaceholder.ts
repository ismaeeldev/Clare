/**
 * Placeholder persistence — Step 1.3 scope boundary ("do not wire up
 * Supabase yet", Master Prompt task 6). Extracted from App.jsx's `save`
 * function (lines 106-108), used across multiple extracted screens
 * (Onboarding's ProfilSetupScreen, Chat's brief update) rather than
 * duplicated per-screen — promoted to shared once a second real usage
 * appeared, per docs/08_CodingStandards.md's reuse rule.
 *
 * Step 2/3 replaces every call site of this with real Supabase writes; this
 * file's job ends there.
 */
const STORAGE_PREFIX = "clare:";

export async function saveLocal(key: string, val: unknown): Promise<void> {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(val));
  } catch {
    // Placeholder persistence — failures here are not user-facing at this
    // stage; Step 2/3's real Supabase writes get real error handling.
  }
}

export async function loadLocal<T>(key: string): Promise<T | null> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/**
 * clearAllLocal — wipes every clare:-prefixed placeholder key. These keys
 * are not user-scoped (Step 1.3 scope boundary never anticipated multiple
 * accounts on one device), so without this, signing out and signing back
 * in as a different user on the same browser would leak the previous
 * user's focus session/routine/lieux/favoris/dernier brief into the new
 * session. Called from the sign-out path (useAuth's SIGNED_OUT handler).
 */
export function clearAllLocal(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // Best-effort cleanup — a storage-access failure here shouldn't block sign-out.
  }
}
