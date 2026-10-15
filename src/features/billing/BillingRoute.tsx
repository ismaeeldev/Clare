import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchSubscription, type SubscriptionRow } from "@/lib/subscriptionsRepo";
import { callEdgeFunction } from "@/lib/edgeFunctions";
import { BillingScreen } from "./BillingScreen";

const ENTITLED_STATUSES = new Set(["active", "trialing"]);

/**
 * BillingRoute — router-level wrapper for BillingScreen (Step 7.2 task
 * 5/6). Handles the Checkout/Portal redirect flow and the return-from-
 * Stripe "Confirmation en cours..." window: webhook processing is async
 * (stripe-webhook, not this route), so a visit right after returning from
 * Stripe polls subscriptions.status for a few seconds rather than either
 * claiming false "active" immediately or showing "not subscribed" while
 * the webhook is still in flight.
 */
export function BillingRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [confirmationTimedOut, setConfirmationTimedOut] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [portalError, setPortalError] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    const returnedFromCheckout = searchParams.get("checkout") === "success";

    (async () => {
      try {
        let sub = await fetchSubscription(user.id);
        if (cancelled) return;

        if (returnedFromCheckout && !ENTITLED_STATUSES.has(sub?.status ?? "")) {
          // Webhook hasn't landed yet — poll briefly (max ~10s) rather
          // than showing a false "not subscribed" state right after a
          // successful Stripe checkout.
          setLoadingData(false);
          setConfirming(true);
          let becameEntitled = false;
          for (let attempt = 0; attempt < 5 && !cancelled; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 2000));
            sub = await fetchSubscription(user.id);
            if (cancelled) return;
            if (ENTITLED_STATUSES.has(sub?.status ?? "")) {
              becameEntitled = true;
              break;
            }
          }
          setConfirming(false);
          // The webhook can genuinely take longer than ~10s under real
          // load — distinguish "still processing, check back" from a
          // plain "never subscribed" state rather than silently reverting
          // to the same S'abonner button the user just tapped.
          if (!becameEntitled) setConfirmationTimedOut(true);
        }

        if (returnedFromCheckout) {
          // Clear the query param whenever we returned from Stripe,
          // whether or not polling actually ran (the webhook can beat us
          // to the first fetch above) — otherwise a page refresh after an
          // already-fast webhook leaves `?checkout=success` in the URL
          // forever since the polling branch above is skipped entirely.
          setSearchParams({}, { replace: true });
        }

        setSubscription(sub);
      } finally {
        if (!cancelled) setLoadingData(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchParams/setSearchParams intentionally excluded: re-running on every param change would restart polling on the very setSearchParams call this effect itself makes.
  }, [user, authLoading]);

  const handleCheckout = async () => {
    if (!user) return;
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const successUrl = `${window.location.origin}/billing?checkout=success`;
      const cancelUrl = `${window.location.origin}/billing`;
      const result = await callEdgeFunction<{ url: string }>("stripe-checkout", { success_url: successUrl, cancel_url: cancelUrl }, 20000);
      window.location.href = result.url;
    } catch (e) {
      setCheckoutError(e instanceof Error ? e.message : "La création de la session de paiement a échoué — réessaie.");
      setCheckoutLoading(false);
    }
  };

  const handleManage = async () => {
    if (!user) return;
    setPortalLoading(true);
    setPortalError("");
    try {
      const returnUrl = `${window.location.origin}/billing`;
      const result = await callEdgeFunction<{ url: string }>("stripe-portal", { return_url: returnUrl }, 20000);
      window.location.href = result.url;
    } catch (e) {
      setPortalError(e instanceof Error ? e.message : "L'ouverture de la gestion d'abonnement a échoué — réessaie.");
      setPortalLoading(false);
    }
  };

  return (
    <BillingScreen
      subscription={subscription}
      loading={authLoading || loadingData}
      confirming={confirming}
      confirmationTimedOut={confirmationTimedOut}
      checkoutLoading={checkoutLoading}
      portalLoading={portalLoading}
      checkoutError={checkoutError}
      portalError={portalError}
      onCheckout={handleCheckout}
      onManage={handleManage}
      onBack={() => navigate("/home")}
    />
  );
}
