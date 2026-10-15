import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { clearAllLocal } from "@/lib/localStoragePlaceholder";

/**
 * useAuth — Step 2.3's Master Prompt task 6: exposes current user/session
 * state app-wide via Supabase's own onAuthStateChange listener (which fires
 * immediately with the current session on subscribe, then again on every
 * sign-in/sign-out/token-refresh) rather than a one-shot getSession() call.
 *
 * Backed by a single AuthProvider (mounted once in main.jsx) rather than
 * each caller running its own useEffect/onAuthStateChange subscription —
 * ~20 screens call useAuth(), and before this provider existed each one
 * mounted an independent Supabase auth listener simultaneously (20+
 * duplicate subscriptions firing on every sign-in/sign-out/token-refresh).
 * useAuth()'s signature is unchanged so no call site needed updating.
 */
export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // SIGNED_OUT fires on every sign-out path (manual logout, account
      // deletion) — clear the clare:-prefixed placeholder keys here so a
      // different account signing in on the same device/browser never
      // inherits the previous user's focus session/routine/lieux/favoris
      // (those keys aren't user-scoped; see localStoragePlaceholder.ts).
      if (event === "SIGNED_OUT") {
        clearAllLocal();
      }
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading }),
    [session, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
