import { getSupabaseAdmin } from "@/lib/supabase";
import { getPreviousPeriod, percentChange, sum, weightedAverage, type DateRange } from "@/lib/aggregation";
import { AI_REFERRAL_PATTERNS, type AiReferralKey } from "@/lib/integrations/ga4";

export type MetricValue = {
  current: number;
  previous: number;
  delta: number | null;
};

export type BrandPeriodMetrics = {
  sessions: MetricValue;
  conversions: MetricValue;
  organicTraffic: MetricValue;
  newUsers: MetricValue;
  clicks: MetricValue;
  impressions: MetricValue;
  organicReach: MetricValue;
  ctr: MetricValue;
  avgPosition: MetricValue;
  keywordsTop3: MetricValue;
  totalKeywords: MetricValue;
  googleSpend: MetricValue;
  googleImpressions: MetricValue;
  googleClicks: MetricValue;
  googleConversions: MetricValue;
  googleCostPerConversion: MetricValue;
  metaSpend: MetricValue;
  metaImpressions: MetricValue;
  metaClicks: MetricValue;
  metaLeads: MetricValue;
  metaCtr: MetricValue;
  metaCostPerLead: MetricValue;
  adLeads: MetricValue;
  weeklyLeads: MetricValue;
  aiTotal: MetricValue;
  aiReferrals: Record<AiReferralKey, MetricValue>;
};

function metric(current: number, previous: number): MetricValue {
  return { current, previous, delta: percentChange(current, previous) };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function inRange<T extends { date: string }>(rows: T[], range: DateRange): T[] {
  return rows.filter((row) => row.date >= range.start && row.date <= range.end);
}

function adsSlice(
  rows: Array<{ source: string; spend: number; clicks?: number | null; impressions?: number | null; leads: number }>,
  source: string,
) {
  const matched = rows.filter((row) => row.source === source);
  return {
    spend: sum(matched.map((row) => Number(row.spend ?? 0))),
    clicks: sum(matched.map((row) => Number(row.clicks ?? 0))),
    impressions: sum(matched.map((row) => Number(row.impressions ?? 0))),
    leads: sum(matched.map((row) => Number(row.leads ?? 0))),
  };
}

function emptyAiMetrics(): Record<AiReferralKey, number> {
  return Object.fromEntries(AI_REFERRAL_PATTERNS.map((pattern) => [pattern.key, 0])) as Record<AiReferralKey, number>;
}

function aiBreakdown(
  rows: Array<{ ai_referral_breakdown: Record<string, number> | null }>,
): Record<AiReferralKey, number> {
  const totals = emptyAiMetrics();
  for (const row of rows) {
    const breakdown = row.ai_referral_breakdown ?? {};
    for (const pattern of AI_REFERRAL_PATTERNS) {
      totals[pattern.key] += Number(breakdown[pattern.key] ?? 0);
    }
  }
  return totals;
}

export async function getBrandPeriodMetrics(
  brandId: string,
  range: DateRange,
): Promise<BrandPeriodMetrics> {
  const previous = getPreviousPeriod(range);
  const supabase = getSupabaseAdmin();
  const from = previous.start;
  const to = range.end;

  const [{ data: ga4, error: ga4Error }, { data: gsc, error: gscError }, { data: ads, error: adsError }, { data: leads }] =
    await Promise.all([
      supabase
        .from("ga4_metrics")
        .select("date, sessions, conversions, organic_sessions, new_users, ai_referral_breakdown")
        .eq("brand_id", brandId)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("gsc_metrics")
        .select("date, clicks, impressions, ctr, avg_position, keywords_top3, total_keywords")
        .eq("brand_id", brandId)
        .gte("date", from)
        .lte("date", to),
      supabase
        .from("ads_metrics")
        .select("date, source, spend, leads, clicks, impressions")
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

  const missingColumn = (message: string | undefined) =>
    Boolean(message && /does not exist|schema cache/i.test(message));

  const ga4Data =
    ga4Error && missingColumn(ga4Error.message)
      ? (
          await supabase
            .from("ga4_metrics")
            .select("date, sessions, conversions, ai_referral_breakdown")
            .eq("brand_id", brandId)
            .gte("date", from)
            .lte("date", to)
        ).data
      : ga4Error
        ? (() => {
            throw new Error(ga4Error.message);
          })()
        : ga4;
  const gscData =
    gscError && missingColumn(gscError.message)
      ? (
          await supabase
            .from("gsc_metrics")
            .select("date, clicks, impressions, ctr, avg_position")
            .eq("brand_id", brandId)
            .gte("date", from)
            .lte("date", to)
        ).data
      : gscError
        ? (() => {
            throw new Error(gscError.message);
          })()
        : gsc;
  const adsData =
    adsError && missingColumn(adsError.message)
      ? (
          await supabase
            .from("ads_metrics")
            .select("date, source, spend, leads, clicks")
            .eq("brand_id", brandId)
            .gte("date", from)
            .lte("date", to)
        ).data
      : adsError
        ? (() => {
            throw new Error(adsError.message);
          })()
        : ads;

  const ga4Rows = (ga4Data ?? []) as Array<{
    date: string;
    sessions: number;
    conversions: number;
    organic_sessions: number | null;
    new_users: number | null;
    ai_referral_breakdown: Record<string, number> | null;
  }>;
  const gscRows = (gscData ?? []) as Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number | null;
    keywords_top3: number | null;
    total_keywords: number | null;
  }>;
  const adsRows = (adsData ?? []) as Array<{
    date: string;
    source: string;
    spend: number;
    leads: number;
    clicks: number | null;
    impressions: number | null;
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
      keywordsTop3: sum(rows.map((row) => Number(row.keywords_top3 ?? 0))),
      totalKeywords: sum(rows.map((row) => Number(row.total_keywords ?? 0))),
    };
  };

  const currentSeo = gscRollup(currentGsc);
  const previousSeo = gscRollup(previousGsc);

  const currentGoogle = adsSlice(currentAds, "google");
  const previousGoogle = adsSlice(previousAds, "google");
  const currentMeta = adsSlice(currentAds, "meta");
  const previousMeta = adsSlice(previousAds, "meta");
  const currentAi = aiBreakdown(currentGa4);
  const previousAi = aiBreakdown(previousGa4);
  const currentAiTotal = sum(Object.values(currentAi));
  const previousAiTotal = sum(Object.values(previousAi));

  const aiReferrals = Object.fromEntries(
    AI_REFERRAL_PATTERNS.map((pattern) => [pattern.key, metric(currentAi[pattern.key], previousAi[pattern.key])]),
  ) as Record<AiReferralKey, MetricValue>;

  return {
    sessions: metric(sum(currentGa4.map((row) => Number(row.sessions ?? 0))), sum(previousGa4.map((row) => Number(row.sessions ?? 0)))),
    conversions: metric(sum(currentGa4.map((row) => Number(row.conversions ?? 0))), sum(previousGa4.map((row) => Number(row.conversions ?? 0)))),
    organicTraffic: metric(
      sum(currentGa4.map((row) => Number(row.organic_sessions ?? 0))),
      sum(previousGa4.map((row) => Number(row.organic_sessions ?? 0))),
    ),
    newUsers: metric(
      sum(currentGa4.map((row) => Number(row.new_users ?? 0))),
      sum(previousGa4.map((row) => Number(row.new_users ?? 0))),
    ),
    clicks: metric(currentSeo.clicks, previousSeo.clicks),
    impressions: metric(currentSeo.impressions, previousSeo.impressions),
    organicReach: metric(currentSeo.impressions, previousSeo.impressions),
    ctr: metric(currentSeo.ctr * 100, previousSeo.ctr * 100),
    avgPosition: metric(currentSeo.avgPosition, previousSeo.avgPosition),
    keywordsTop3: metric(currentSeo.keywordsTop3, previousSeo.keywordsTop3),
    totalKeywords: metric(currentSeo.totalKeywords, previousSeo.totalKeywords),
    googleSpend: metric(currentGoogle.spend, previousGoogle.spend),
    googleImpressions: metric(currentGoogle.impressions, previousGoogle.impressions),
    googleClicks: metric(currentGoogle.clicks, previousGoogle.clicks),
    googleConversions: metric(currentGoogle.leads, previousGoogle.leads),
    googleCostPerConversion: metric(
      ratio(currentGoogle.spend, currentGoogle.leads),
      ratio(previousGoogle.spend, previousGoogle.leads),
    ),
    metaSpend: metric(currentMeta.spend, previousMeta.spend),
    metaImpressions: metric(currentMeta.impressions, previousMeta.impressions),
    metaClicks: metric(currentMeta.clicks, previousMeta.clicks),
    metaLeads: metric(currentMeta.leads, previousMeta.leads),
    metaCtr: metric(ratio(currentMeta.clicks, currentMeta.impressions) * 100, ratio(previousMeta.clicks, previousMeta.impressions) * 100),
    metaCostPerLead: metric(ratio(currentMeta.spend, currentMeta.leads), ratio(previousMeta.spend, previousMeta.leads)),
    adLeads: metric(currentGoogle.leads + currentMeta.leads, previousGoogle.leads + previousMeta.leads),
    weeklyLeads: metric(sum(currentLeads.map((row) => row.lead_count)), sum(previousLeads.map((row) => row.lead_count))),
    aiTotal: metric(currentAiTotal, previousAiTotal),
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
