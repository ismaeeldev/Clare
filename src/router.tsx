import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";

/**
 * Router — Step 2.3. Routes per docs/04_ApplicationFlow.md §1.
 *
 * Every route except the 3 auth screens is now wrapped in ProtectedRoute
 * (Step 2.3): an unauthenticated visit redirects to /sign-in, carrying the
 * intended path so SignInScreen can return here after a successful sign-in
 * (04_ApplicationFlow.md §2.1's deep-link edge case). The screens
 * themselves still use Step 1.3's placeholder local/localStorage data —
 * Step 3 replaces that placeholder data with real Supabase queries scoped
 * to the authenticated user; this router only gates *access*, not data.
 *
 * Screens are added to this router as each staged-extraction batch
 * completes (see docs/07_ProjectState.md session log for progress).
 */
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { GuestRoute } from "@/components/auth/GuestRoute";
import { PremiumRoute } from "@/components/auth/PremiumRoute";
import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/Skeleton";
import { SignInScreen } from "@/features/auth/SignInScreen";
import { SignUpScreen } from "@/features/auth/SignUpScreen";
import { ForgotPasswordScreen } from "@/features/auth/ForgotPasswordScreen";
import { ResetPasswordScreen } from "@/features/auth/ResetPasswordScreen";

/**
 * Every post-auth screen is route-split via React.lazy rather than imported
 * eagerly — a Vite build audit found the entire app (all ~20 screens plus
 * recharts/framer-motion) shipping in one 1.34MB/378KB-gzip chunk, so every
 * visitor downloaded Admin/Stats/Chat/etc. just to see the sign-in screen.
 * Auth screens above stay eager since they're the smallest and the very
 * first thing an unauthenticated visitor needs. RouteFallback below matches
 * ProtectedRoute's own loading skeleton so the lazy-chunk fetch doesn't
 * introduce a visibly different loading state from the auth-check one.
 */
const OnboardingScreen = lazy(() => import("@/features/onboarding/OnboardingScreen").then((m) => ({ default: m.OnboardingScreen })));
const HomeRoute = lazy(() => import("@/features/home/HomeRoute").then((m) => ({ default: m.HomeRoute })));
const ChatRoute = lazy(() => import("@/features/chat/ChatRoute").then((m) => ({ default: m.ChatRoute })));
const JournalRoute = lazy(() => import("@/features/journal/JournalRoute").then((m) => ({ default: m.JournalRoute })));
const FocusRoute = lazy(() => import("@/features/focus/FocusRoute").then((m) => ({ default: m.FocusRoute })));
const StatsRoute = lazy(() => import("@/features/stats/StatsRoute").then((m) => ({ default: m.StatsRoute })));
const AgendaRoute = lazy(() => import("@/features/agenda/AgendaRoute").then((m) => ({ default: m.AgendaRoute })));
const NutritionRoute = lazy(() => import("@/features/nutrition/NutritionRoute").then((m) => ({ default: m.NutritionRoute })));
const ProfilEditRoute = lazy(() => import("@/features/profil-edit/ProfilEditRoute").then((m) => ({ default: m.ProfilEditRoute })));
const PrepDimancheRoute = lazy(() => import("@/features/prep-dimanche/PrepDimancheRoute").then((m) => ({ default: m.PrepDimancheRoute })));
const RoutineRoute = lazy(() => import("@/features/routine/RoutineRoute").then((m) => ({ default: m.RoutineRoute })));
const LieuxRoute = lazy(() => import("@/features/lieux/LieuxRoute").then((m) => ({ default: m.LieuxRoute })));
const IdeesRoute = lazy(() => import("@/features/idees/IdeesRoute").then((m) => ({ default: m.IdeesRoute })));
const JournalHistoryRoute = lazy(() => import("@/features/journal/JournalHistoryRoute").then((m) => ({ default: m.JournalHistoryRoute })));
const NotificationsRoute = lazy(() => import("@/features/notifications/NotificationsRoute").then((m) => ({ default: m.NotificationsRoute })));
const BillingRoute = lazy(() => import("@/features/billing/BillingRoute").then((m) => ({ default: m.BillingRoute })));
const AdminRoute = lazy(() => import("@/features/admin/AdminRoute").then((m) => ({ default: m.AdminRoute })));
const SettingsRoute = lazy(() => import("@/features/settings/SettingsRoute").then((m) => ({ default: m.SettingsRoute })));
const LiveWorkoutRoute = lazy(() => import("@/features/workout/LiveWorkoutRoute").then((m) => ({ default: m.LiveWorkoutRoute })));

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg">
      <Skeleton width={200} height={24} />
    </div>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<RouteFallback />}>{children}</Suspense>;
}

export const router = createBrowserRouter([
  { path: "/", element: <GuestRoute><SignInScreen /></GuestRoute> },
  { path: "/sign-in", element: <GuestRoute><SignInScreen /></GuestRoute> },
  { path: "/sign-up", element: <GuestRoute><SignUpScreen /></GuestRoute> },
  { path: "/forgot-password", element: <GuestRoute><ForgotPasswordScreen /></GuestRoute> },
  // Not wrapped in GuestRoute — Supabase's recovery link signs the user in
  // before they reach this screen, so gating on "already has a session"
  // would redirect them away before they could set their new password.
  { path: "/reset-password", element: <ResetPasswordScreen /> },
  {
    path: "/onboarding",
    element: (
      <ProtectedRoute>
        <Lazy>
          <OnboardingScreen />
        </Lazy>
      </ProtectedRoute>
    ),
  },
  {
    path: "/home",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <HomeRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/chat",
    element: (
      <ProtectedRoute>
        <AppShell>
          <PremiumRoute>
            <Lazy>
              <ChatRoute />
            </Lazy>
          </PremiumRoute>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/journal",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <JournalRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/focus",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <FocusRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/stats",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <StatsRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/agenda",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <AgendaRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/nutrition",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <NutritionRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/profile",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <ProfilEditRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/prep-dimanche",
    element: (
      <ProtectedRoute>
        <AppShell>
          <PremiumRoute>
            <Lazy>
              <PrepDimancheRoute />
            </Lazy>
          </PremiumRoute>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    // Not wrapped in AppShell — a genuine full-screen takeover
    // (04_ApplicationFlow.md §2.8), unlike prep-dimanche above which the
    // codebase's established convention still nests in AppShell despite
    // its own doc wording. Live Workout Mode's nav chrome would compete
    // with an active timer/mic and offers no useful navigation mid-session
    // anyway (the exit-confirm dialog is the only way out).
    path: "/workout",
    element: (
      <ProtectedRoute>
        <Lazy>
          <LiveWorkoutRoute />
        </Lazy>
      </ProtectedRoute>
    ),
  },
  {
    path: "/routine",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <RoutineRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/lieux",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <LieuxRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/idees",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <IdeesRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/historique",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <JournalHistoryRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/notifications",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <NotificationsRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/billing",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <BillingRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    path: "/settings",
    element: (
      <ProtectedRoute>
        <AppShell>
          <Lazy>
            <SettingsRoute />
          </Lazy>
        </AppShell>
      </ProtectedRoute>
    ),
  },
  {
    // Deliberately NOT in normal app navigation (master prompt §7.3
    // task 1) — reachable only by typing /admin directly. Real access
    // control is server-side in admin-metrics (checks admin_users), not
    // this route — a hidden frontend route alone is explicitly
    // insufficient per CLA-FR-022.
    path: "/admin",
    element: (
      <ProtectedRoute>
        <Lazy>
          <AdminRoute />
        </Lazy>
      </ProtectedRoute>
    ),
  },
  // All 14 screens from the original App.jsx are now extracted, routed, and
  // access-gated behind ProtectedRoute. As of Step 3.4, /historique points
  // at the real JournalHistoryRoute (journal_entries/finance_entries-backed)
  // rather than the Step 1.3 placeholder — see
  // src/features/historique/reference/ for that superseded version.
  // Note: Step 3.2 has since wired real per-step Supabase persistence and
  // resume (src/lib/profileRepo.ts's saveOnboardingStep/loadProfile) — a
  // user who closes the tab mid-onboarding and returns resumes at their
  // saved step with their saved answers, not step 0. What's still deferred
  // is only the spec's "/onboarding/:step" URL param itself
  // (04_ApplicationFlow.md §1): OnboardingScreen/ProfilSetupScreen track
  // the current step in component state rather than the URL, so the step
  // isn't reflected in the address bar or deep-linkable — a cosmetic gap,
  // not a data-loss one.
]);
