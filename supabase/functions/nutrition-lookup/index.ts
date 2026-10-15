// nutrition-lookup — docs/03_MasterPrompts.md §5.2 task 2.
// Server-side Open Food Facts fallback for packaged/branded foods not
// found in the CIQUAL set (scripts/import-ciqual.mjs). Caches results into
// nutrition_foods with source='off' so repeated lookups of the same
// product don't re-hit OFF every time. Called by nutrition-calc when a
// CIQUAL lookup misses (never called directly by the client).
//
// Attribution (Open Food Facts, ODbL): data sourced from
// https://world.openfoodfacts.org — Open Database License, contributors
// credited via OFF's own product pages.
import { corsHeaders } from "../_shared/cors.ts";
import { getUserId } from "../_shared/auth.ts";
import { getServiceClient } from "../_shared/serviceClient.ts";

const OFF_USER_AGENT = "Clare-App/1.0 (nutrition-lookup Edge Function)";
const DATASET_VERSION = "off-live";
// A quality_flag on OFF-sourced rows: 'community' — unlike CIQUAL's lab-
// measured values, OFF data is user-contributed and occasionally missing/
// wrong (registry §2.9 / CLA-FR-014 doesn't forbid using it, but the UI's
// "subtle source-attribution badge" (05_ApplicationFlow §2.10) needs a way
// to tell CIQUAL and OFF rows apart).
const QUALITY_FLAG = "community";

interface OffNutriments {
  "energy-kcal_100g"?: number;
  proteins_100g?: number;
  carbohydrates_100g?: number;
  fat_100g?: number;
}

interface FoundFood {
  source: "off";
  source_id: string;
  name: string;
  kcal_per_100g: number | null;
  protein_per_100g: number | null;
  carbs_per_100g: number | null;
  fat_per_100g: number | null;
  dataset_version: string;
  quality_flag: string;
}

function toRow(code: string, name: string, n: OffNutriments | undefined): FoundFood {
  return {
    source: "off",
    source_id: code,
    name,
    kcal_per_100g: typeof n?.["energy-kcal_100g"] === "number" ? n["energy-kcal_100g"] : null,
    protein_per_100g: typeof n?.proteins_100g === "number" ? n.proteins_100g : null,
    carbs_per_100g: typeof n?.carbohydrates_100g === "number" ? n.carbohydrates_100g : null,
    fat_per_100g: typeof n?.fat_100g === "number" ? n.fat_100g : null,
    dataset_version: DATASET_VERSION,
    quality_flag: QUALITY_FLAG,
  };
}

async function lookupByBarcode(barcode: string): Promise<FoundFood | null> {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=code,product_name,nutriments`, {
    headers: { "User-Agent": OFF_USER_AGENT },
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const name = typeof data.product.product_name === "string" && data.product.product_name.trim() ? data.product.product_name : barcode;
  return toRow(data.product.code ?? barcode, name, data.product.nutriments);
}

async function lookupByName(query: string): Promise<FoundFood | null> {
  const res = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=5&fields=code,product_name,nutriments`,
    { headers: { "User-Agent": OFF_USER_AGENT } }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const hits: { code?: string; product_name?: string; nutriments?: OffNutriments }[] = data.hits ?? [];
  // Pick the first hit that actually has a usable kcal value — OFF search
  // results are frequently incomplete (many products have no nutriments
  // filled in at all), and a hit with no numbers is worse than no hit:
  // nutrition-calc must flag the ingredient as unresolved rather than
  // silently caching a row of all-nulls that looks resolved later.
  const usable = hits.find((h) => typeof h.nutriments?.["energy-kcal_100g"] === "number" && h.code);
  if (!usable) return null;
  const name = typeof usable.product_name === "string" && usable.product_name.trim() ? usable.product_name : query;
  return toRow(usable.code!, name, usable.nutriments);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const userId = await getUserId(req);
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const query: string | undefined = typeof body.query === "string" ? body.query.trim() : undefined;
    const barcode: string | undefined = typeof body.barcode === "string" ? body.barcode.trim() : undefined;
    if (!query && !barcode) {
      return new Response(JSON.stringify({ error: "query or barcode is required" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const found = barcode ? await lookupByBarcode(barcode) : await lookupByName(query!);
    if (!found) {
      return new Response(JSON.stringify({ food: null }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Cache into nutrition_foods via the service-role client — this table
    // has no client write policy at all (0005_nutrition.sql), by design:
    // it's shared reference data, and only a server-side process (this
    // function, or the CIQUAL import script) is trusted to populate it.
    const serviceClient = getServiceClient();
    const { data: cached, error } = await serviceClient
      .from("nutrition_foods")
      .upsert(found, { onConflict: "source,source_id,dataset_version" })
      .select("id, source, source_id, name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g, dataset_version, quality_flag")
      .single();
    if (error) throw error;

    return new Response(JSON.stringify({ food: cached }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
