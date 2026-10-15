import React from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { router } from "./router.tsx";
import { OfflineBanner } from "./components/ui/OfflineBanner.tsx";
import { ClerkExtractBannerBusProvider } from "./lib/clerkExtractBannerBus.tsx";
import { AuthProvider } from "./hooks/useAuth.tsx";
import "./styles/globals.css";

/**
 * Step 1.3 is complete: all 14 screens from the original App.jsx are
 * extracted into src/features/* and routed. The /legacy fallback (which
 * rendered the original App.jsx directly during the staged extraction) is
 * retired now that nothing depends on it — see docs/07_ProjectState.md
 * session log for the batch-by-batch extraction history.
 *
 * The temporary ?dev=components preview (Step 1.2/1.2.5) is still available
 * for visual component review.
 */
const isComponentPreview = new URLSearchParams(window.location.search).get("dev") === "components";

async function bootstrap() {
  const root = createRoot(document.getElementById("root"));

  if (isComponentPreview) {
    const { ComponentPreview } = await import("./dev/ComponentPreview.tsx");
    root.render(
      <React.StrictMode>
        <MotionConfig reducedMotion="user">
          <OfflineBanner />
          <AuthProvider>
            <ComponentPreview />
          </AuthProvider>
        </MotionConfig>
      </React.StrictMode>
    );
    return;
  }

  root.render(
    <React.StrictMode>
      <MotionConfig reducedMotion="user">
        <OfflineBanner />
        <AuthProvider>
          <ClerkExtractBannerBusProvider>
            <RouterProvider router={router} />
          </ClerkExtractBannerBusProvider>
        </AuthProvider>
      </MotionConfig>
    </React.StrictMode>
  );
}

bootstrap();
