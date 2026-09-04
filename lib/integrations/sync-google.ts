import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGa4ForBrand } from "@/lib/integrations/ga4";
import { syncGscForBrand } from "@/lib/integrations/gsc";
import { syncGoogleAdsForBrand } from "@/lib/integrations/google-ads";
import { syncMetaAdsForBrand } from "@/lib/integrations/meta-ads";
import { DASHBOARD_SYNC_DAYS, syncDateRange } from "@/lib/integrations/sync-window";

export type SourceResult<T> = T | { ok: false; error: string } | { skipped: true; reason: string };

export type BrandSyncResult = {
  slug: string;
  name: string;
  ga4: SourceResult<{ ok: true; days: number; sessions: number; conversions: number }>;
  gsc: SourceResult<{ ok: true; days: number; clicks: number; impressions: number }>;
  ads: SourceResult<{ ok: true; days: number; spend: number; clicks: number; leads: number }>;
  meta: SourceResult<{ ok: true; days: number; spend: number; clicks: number; leads: number }>;
};

type BrandCreds = {
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  google_ads_customer_id: string | null;
  meta_ad_account_id: string | null;
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

function summarize(result: BrandSyncResult): string {
  const parts = [result.name];
  const line = (
    label: string,
    value: BrandSyncResult["ga4"] | BrandSyncResult["gsc"] | BrandSyncResult["ads"] | BrandSyncResult["meta"],
  ) => {
    if ("skipped" in value) return `${label} skipped`;
    if (value.ok === false) return `${label} failed: ${value.error}`;
    if ("sessions" in value) return `GA4 ${value.days}d / ${value.sessions} sess`;
    if ("impressions" in value) return `GSC ${value.days}d / ${value.clicks} clicks`;
    if ("spend" in value) return `${label} ${value.days}d / $${value.spend.toFixed(0)} / ${value.leads} leads`;
    return label;
  };
  parts.push(line("GA4", result.ga4), line("GSC", result.gsc), line("Ads", result.ads), line("Meta", result.meta));
  return parts.join(" · ");
}

async function syncOneBrand(
  brand: { id: string; slug: string; name: string },
  creds: BrandCreds | undefined,
  startDate: string,
  endDate: string,
): Promise<BrandSyncResult> {
  const row: BrandSyncResult = {
    slug: brand.slug,
    name: brand.name,
    ga4: { skipped: true, reason: "No GA4 property ID" },
    gsc: { skipped: true, reason: "No GSC site URL" },
    ads: { skipped: true, reason: "No Google Ads customer ID" },
    meta: { skipped: true, reason: "No Meta ad account ID" },
  };

  if (creds?.ga4_property_id) {
    try {
      const ga4 = await syncGa4ForBrand(brand.id, startDate, endDate);
      row.ga4 = { ok: true, days: ga4.days, sessions: ga4.sessions, conversions: ga4.conversions };
    } catch (ga4Error) {
      await logFailure(brand.id, "ga4", ga4Error);
      row.ga4 = { ok: false, error: ga4Error instanceof Error ? ga4Error.message : "GA4 sync failed" };
    }
  }

  if (creds?.gsc_site_url) {
    try {
      const gsc = await syncGscForBrand(brand.id, startDate, endDate);
      row.gsc = { ok: true, days: gsc.days, clicks: gsc.clicks, impressions: gsc.impressions };
    } catch (gscError) {
      await logFailure(brand.id, "gsc", gscError);
      row.gsc = { ok: false, error: gscError instanceof Error ? gscError.message : "GSC sync failed" };
    }
  }

  if (creds?.google_ads_customer_id) {
    try {
      const ads = await syncGoogleAdsForBrand(brand.id, startDate, endDate);
      row.ads = { ok: true, days: ads.days, spend: ads.spend, clicks: ads.clicks, leads: ads.leads };
    } catch (adsError) {
      await logFailure(brand.id, "google_ads", adsError);
      row.ads = { ok: false, error: adsError instanceof Error ? adsError.message : "Google Ads sync failed" };
    }
  }

  if (creds?.meta_ad_account_id) {
    try {
      const meta = await syncMetaAdsForBrand(brand.id, startDate, endDate);
      row.meta = { ok: true, days: meta.days, spend: meta.spend, clicks: meta.clicks, leads: meta.leads };
    } catch (metaError) {
      await logFailure(brand.id, "meta_ads", metaError);
      row.meta = { ok: false, error: metaError instanceof Error ? metaError.message : "Meta Ads sync failed" };
    }
  }

  return row;
}

export function formatBrandSyncSummary(result: BrandSyncResult): string {
  return summarize(result);
}

export async function syncGoogleMetricsForBrand(brandId: string, days = DASHBOARD_SYNC_DAYS): Promise<{
  startDate: string;
  endDate: string;
  brand: BrandSyncResult;
}> {
  const { startDate, endDate } = syncDateRange(days);
  const supabase = getSupabaseAdmin();

  const { data: brand, error } = await supabase
    .from("brands")
    .select("id, slug, name")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!brand) throw new Error("Brand not found.");

  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (credError) throw new Error(credError.message);

  const result = await syncOneBrand(
    { id: brand.id as string, slug: brand.slug as string, name: brand.name as string },
    creds as BrandCreds | null ?? undefined,
    startDate,
    endDate,
  );

  return { startDate, endDate, brand: result };
}

export async function syncGoogleMetrics(days = DASHBOARD_SYNC_DAYS): Promise<{
  startDate: string;
  endDate: string;
  brands: BrandSyncResult[];
}> {
  const { startDate, endDate } = syncDateRange(days);
  const supabase = getSupabaseAdmin();

  const { data: brands, error } = await supabase.from("brands").select("id, slug, name").order("name");
  if (error) throw new Error(error.message);

  const { data: credentials, error: credError } = await supabase
    .from("brand_credentials")
    .select("brand_id, ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id");
  if (credError) throw new Error(credError.message);

  const credsByBrand = new Map((credentials ?? []).map((row) => [row.brand_id as string, row as BrandCreds & { brand_id: string }]));
  const results: BrandSyncResult[] = [];

  for (const brand of brands ?? []) {
    results.push(
      await syncOneBrand(
        { id: brand.id as string, slug: brand.slug as string, name: brand.name as string },
        credsByBrand.get(brand.id as string),
        startDate,
        endDate,
      ),
    );
  }

  return { startDate, endDate, brands: results };
}
