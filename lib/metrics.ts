import { getSupabaseAdmin } from "@/lib/supabase";
import { getPreviousPeriod, percentChange, sum, weightedAverage, type DateRange } from "@/lib/aggregation";

export type MetricValue = {
  current: number;
  previous: number;
  delta: number | null;
};

export type BrandPeriodMetrics = {
  sessions: MetricValue;
  conversions: MetricValue;
  clicks: MetricValue;
  impressions: MetricValue;
  ctr: MetricValue;
  avgPosition: MetricValue;
  googleSpend: MetricValue;
  metaSpend: MetricValue;
  adLeads: MetricValue;
  weeklyLeads: MetricValue;
  aiReferrals: Record<string, number>;
};

function metric(current: number, previous: number): MetricValue {
  return { current, previous, delta: percentChange(current, previous) };
}

function inRange<T extends { date: string }>(rows: T[], range: DateRange): T[] {
  return rows.filter((row) => row.date >= range.start && row.date <= range.end);
}

export async function getBrandPeriodMetrics(
  brandId: string,
  range: DateRange,
): Promise<BrandPeriodMetrics> {
  const previous = getPreviousPeriod(range);
  const supabase = getSupabaseAdmin();
  const from = previous.start;
  const to = range.end;

  const [{ data: ga4 }, { data: gsc }, { data: ads }, { data: leads }] = await Promise.all([
    supabase
      .from("ga4_metrics")
      .select("date, sessions, conversions, ai_referral_breakdown")
      .eq("brand_id", brandId)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("gsc_metrics")
      .select("date, clicks, impressions, ctr, avg_position")
      .eq("brand_id", brandId)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("ads_metrics")
      .select("date, source, spend, leads")
      .eq("brand_id", brandId)
      .gte("date", from)
      .lte("date", to),
    supabase
      .from("manual_leads")
      .select("week_start_date, lead_count")
      .eq("brand_id", brandId)
      .gte("week_start_date", from)
      .lte("week_start_date", to),
  ]);

  const ga4Rows = (ga4 ?? []) as Array<{
    date: string;
    sessions: number;
    conversions: number;
    ai_referral_breakdown: Record<string, number> | null;
  }>;
  const gscRows = (gsc ?? []) as Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number | null;
  }>;
  const adsRows = (ads ?? []) as Array<{
    date: string;
    source: string;
    spend: number;
    leads: number;
  }>;
  const leadRows = (leads ?? []).map((row) => ({
    date: row.week_start_date as string,
    lead_count: Number(row.lead_count ?? 0),
  }));

  const currentGa4 = inRange(ga4Rows, range);
  const previousGa4 = inRange(ga4Rows, previous);
  const currentGsc = inRange(gscRows, range);
  const previousGsc = inRange(gscRows, previous);
  const currentAds = inRange(adsRows, range);
  const previousAds = inRange(adsRows, previous);
  const currentLeads = inRange(leadRows, range);
  const previousLeads = inRange(leadRows, previous);

  const gscRollup = (rows: typeof gscRows) => {
    const clicks = sum(rows.map((row) => Number(row.clicks ?? 0)));
    const impressions = sum(rows.map((row) => Number(row.impressions ?? 0)));
    const positions = rows
      .filter((row) => row.avg_position != null)
      .map((row) => Number(row.avg_position));
    const weights = rows.filter((row) => row.avg_position != null).map((row) => Number(row.impressions ?? 0));
    return {
      clicks,
      impressions,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      avgPosition: positions.length ? weightedAverage(positions, weights) : 0,
    };
  };

  const currentSeo = gscRollup(currentGsc);
  const previousSeo = gscRollup(previousGsc);

  const spend = (rows: typeof adsRows, source: string) =>
    sum(rows.filter((row) => row.source === source).map((row) => Number(row.spend ?? 0)));
  const adLeads = (rows: typeof adsRows) => sum(rows.map((row) => Number(row.leads ?? 0)));

  const aiReferrals: Record<string, number> = {};
  for (const row of currentGa4) {
    const breakdown = row.ai_referral_breakdown ?? {};
    for (const [key, value] of Object.entries(breakdown)) {
      aiReferrals[key] = (aiReferrals[key] ?? 0) + Number(value ?? 0);
    }
  }

  return {
    sessions: metric(sum(currentGa4.map((row) => Number(row.sessions ?? 0))), sum(previousGa4.map((row) => Number(row.sessions ?? 0)))),
    conversions: metric(sum(currentGa4.map((row) => Number(row.conversions ?? 0))), sum(previousGa4.map((row) => Number(row.conversions ?? 0)))),
    clicks: metric(currentSeo.clicks, previousSeo.clicks),
    impressions: metric(currentSeo.impressions, previousSeo.impressions),
    ctr: metric(currentSeo.ctr * 100, previousSeo.ctr * 100),
    avgPosition: metric(currentSeo.avgPosition, previousSeo.avgPosition),
    googleSpend: metric(spend(currentAds, "google"), spend(previousAds, "google")),
    metaSpend: metric(spend(currentAds, "meta"), spend(previousAds, "meta")),
    adLeads: metric(adLeads(currentAds), adLeads(previousAds)),
    weeklyLeads: metric(sum(currentLeads.map((row) => row.lead_count)), sum(previousLeads.map((row) => row.lead_count))),
    aiReferrals,
  };
}

export async function listRecentLeads(brandId: string, limit = 8) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("manual_leads")
    .select("id, week_start_date, lead_count")
    .eq("brand_id", brandId)
    .order("week_start_date", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function upsertWeeklyLeads(input: {
  brandId: string;
  weekStartDate: string;
  leadCount: number;
  enteredBy: string;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("manual_leads").upsert(
    {
      brand_id: input.brandId,
      week_start_date: input.weekStartDate,
      lead_count: input.leadCount,
      entered_by: input.enteredBy,
    },
    { onConflict: "brand_id,week_start_date" },
  );
  if (error) throw new Error(error.message);
}
