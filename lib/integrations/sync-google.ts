import { getSupabaseAdmin } from "@/lib/supabase";
import { isoDateDaysAgo } from "@/lib/integrations/google-auth";
import { syncGa4ForBrand } from "@/lib/integrations/ga4";
import { syncGscForBrand } from "@/lib/integrations/gsc";

export type BrandSyncResult = {
  slug: string;
  name: string;
  ga4:
    | { ok: true; days: number; sessions: number; conversions: number }
    | { ok: false; error: string }
    | { skipped: true; reason: string };
  gsc:
    | { ok: true; days: number; clicks: number; impressions: number }
    | { ok: false; error: string }
    | { skipped: true; reason: string };
};

async function logFailure(brandId: string, source: string, error: unknown) {
  const supabase = getSupabaseAdmin();
  await supabase.from("sync_logs").insert({
    brand_id: brandId,
    source,
    status: "error",
    message: error instanceof Error ? error.message : "Unknown error",
  });
}

export async function syncGoogleMetrics(days = 14): Promise<{
  startDate: string;
  endDate: string;
  brands: BrandSyncResult[];
}> {
  const startDate = isoDateDaysAgo(days);
  const endDate = isoDateDaysAgo(1);
  const supabase = getSupabaseAdmin();

  const { data: brands, error } = await supabase
    .from("brands")
    .select("id, slug, name")
    .order("name");
  if (error) throw new Error(error.message);

  const { data: credentials, error: credError } = await supabase
    .from("brand_credentials")
    .select("brand_id, ga4_property_id, gsc_site_url");
  if (credError) throw new Error(credError.message);

  const credsByBrand = new Map(
    (credentials ?? []).map((row) => [row.brand_id as string, row]),
  );

  const results: BrandSyncResult[] = [];

  for (const brand of brands ?? []) {
    const creds = credsByBrand.get(brand.id as string);
    const row: BrandSyncResult = {
      slug: brand.slug as string,
      name: brand.name as string,
      ga4: { skipped: true, reason: "No GA4 property ID" },
      gsc: { skipped: true, reason: "No GSC site URL" },
    };

    if (creds?.ga4_property_id) {
      try {
        const ga4 = await syncGa4ForBrand(brand.id as string, startDate, endDate);
        row.ga4 = { ok: true, days: ga4.days, sessions: ga4.sessions, conversions: ga4.conversions };
      } catch (ga4Error) {
        await logFailure(brand.id as string, "ga4", ga4Error);
        row.ga4 = { ok: false, error: ga4Error instanceof Error ? ga4Error.message : "GA4 sync failed" };
      }
    }

    if (creds?.gsc_site_url) {
      try {
        const gsc = await syncGscForBrand(brand.id as string, startDate, endDate);
        row.gsc = { ok: true, days: gsc.days, clicks: gsc.clicks, impressions: gsc.impressions };
      } catch (gscError) {
        await logFailure(brand.id as string, "gsc", gscError);
        row.gsc = { ok: false, error: gscError instanceof Error ? gscError.message : "GSC sync failed" };
      }
    }

    results.push(row);
  }

  return { startDate, endDate, brands: results };
}
