// admin-metrics — docs/03_MasterPrompts.md §7.3 / CLA-FR-022.
// Server-enforced admin gate: every request is checked against
// admin_users (service-role read, bypassing RLS — admin_users itself has
// zero client policies at all) BEFORE any metric is computed or
// returned. A hidden frontend route alone is explicitly insufficient per
// the master prompt's own instruction — this is the actual enforcement.
//
// Intentionally narrow (CLA-FR-022): user count, active subscriptions,
// MRR, churn for a period, recent failed webhook/job status. No
// user-content browsing, no impersonation, no CRM/bulk-messaging.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const client = getServiceClient();

    const { data: adminRow } = await client.from("admin_users").select("user_id").eq("user_id", userId).maybeSingle();
    if (!adminRow) {
      // Deliberately the same shape as a generic auth failure — no hint
      // that admin_users exists or that this account was checked against
      // it, for a non-admin caller.
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 403, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const periodDays: number = Number.isFinite(body.period_days) ? body.period_days : 30;
    const periodStart = new Date(Date.now() - periodDays * 86400000).toISOString();

    // A single request with count:"exact" returns both the matching rows
    // AND the total count in one round trip — an earlier version fetched
    // this same active-subscriptions filter twice (once head:true just
    // for the count, once again for the row data), a redundant duplicate
    // query against the same table with the same filter.
    const [userCountRes, activeSubsRes, canceledRes, failedWebhooksRes, failedJobsRes] = await Promise.all([
      client.from("profiles").select("user_id", { count: "exact", head: true }),
      client.from("subscriptions").select("plan_id", { count: "exact" }).in("status", ["active", "trialing"]),
      client.from("subscriptions").select("user_id", { count: "exact", head: true }).eq("status", "canceled").gte("updated_at", periodStart),
      client.from("webhook_events").select("id", { count: "exact", head: true }).is("processed_at", null),
      client.from("agent_runs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("started_at", periodStart),
    ]);

    // MRR: normalized monthly recurring value. This function has no
    // access to each plan_id's actual price (that lives in Stripe, not
    // this DB) — computing a real MRR figure would require either calling
    // the Stripe API per distinct plan_id or storing price alongside
    // plan_id somewhere. Per docs/01_ScopeDocument.md §6's own pattern
    // for undecided specifics, this is marked TODO_CLIENT_DECISION rather
    // than guessed: a fabricated currency/amount would be worse than an
    // honest "not computed yet" state on an admin financial metric.
    const mrr = { status: "TODO_CLIENT_DECISION", note: "Requires per-plan pricing lookup (Stripe API or a stored price map) plus currency/tax handling decisions — not computed here to avoid showing a fabricated number.", active_subscription_count: activeSubsRes.count ?? 0 };

    return new Response(
      JSON.stringify({
        user_count: userCountRes.count ?? 0,
        active_subscriptions: activeSubsRes.count ?? 0,
        mrr,
        canceled_in_period: canceledRes.count ?? 0,
        period_days: periodDays,
        unprocessed_webhooks: failedWebhooksRes.count ?? 0,
        failed_jobs_in_period: failedJobsRes.count ?? 0,
      }),
      { headers: { ...corsHeaders, "content-type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
