import { getSupabaseAdmin } from "@/lib/supabase";
import { easternDateFromTimestamp, getPreviousPeriodRange, getSnapshotAsOf, utcTodayIso, type PeriodKey } from "@/lib/period";
import { percentChange, sum, weightedAverage, type DateRange } from "@/lib/aggregation";
import { AI_REFERRAL_PATTERNS, type AiReferralKey } from "@/lib/integrations/ga4";
import { sumWebLeads } from "@/lib/web-leads";

export type MetricValue = {
  current: number;
  previous: number;
  delta: number | null;
};

export type BrandPeriodMetrics = {
  snapshotCurrent: string;
  snapshotPrevious: string;
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
  googleCpc: MetricValue;
  googleConversions: MetricValue;
  googleCostPerConversion: MetricValue;
  adsCostPerConversion: MetricValue;
  metaSpend: MetricValue;
  metaImpressions: MetricValue;
  metaClicks: MetricValue;
  metaCpc: MetricValue;
  metaLeads: MetricValue;
  metaCtr: MetricValue;
  metaCostPerLead: MetricValue;
  adLeads: MetricValue;
  weeklyLeads: MetricValue;
  webLeads: MetricValue;
  offlineLeads: MetricValue;
  totalLeads: MetricValue;
  aiTotal: MetricValue;
  aiReferrals: Record<AiReferralKey, MetricValue>;
};

function metric(current: number, previous: number): MetricValue {
  return { current, previous, delta: percentChange(current, previous) };
}

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

// Completed months/years stay in-range. The current week can still include today's web forms.
function webLeadsEnd(end: string): string {
  const today = utcTodayIso();
  return end > today ? today : end;
}

function isoDateOnly(value: string): string {
  return String(value).slice(0, 10);
}

function through<T extends { date: string }>(rows: T[], asOf: string): T[] {
  const end = isoDateOnly(asOf);
  return rows.filter((row) => isoDateOnly(row.date) <= end);
}

function inRange<T extends { date: string }>(rows: T[], range: DateRange): T[] {
  const start = isoDateOnly(range.start);
  const end = isoDateOnly(range.end);
  return rows.filter((row) => {
    const date = isoDateOnly(row.date);
    return date >= start && date <= end;
  });
}

function lastThrough<T extends { date: string }>(rows: T[], asOf: string): T | undefined {
  const eligible = through(rows, asOf).sort((a, b) => isoDateOnly(a.date).localeCompare(isoDateOnly(b.date)));
  return eligible[eligible.length - 1];
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

export type OfflineLeadRow = {
  id: string;
  week_start_date: string;
  lead_count: number;
  phone_leads: number;
  email_leads: number;
  referral_leads: number;
  trade_show_leads: number;
  social_media_leads: number;
};

function offlineTotal(row: {
  lead_count?: number | null;
  phone_leads?: number | null;
  email_leads?: number | null;
  referral_leads?: number | null;
  trade_show_leads?: number | null;
  social_media_leads?: number | null;
}): number {
  const phone = Number(row.phone_leads ?? 0);
  const email = Number(row.email_leads ?? 0);
  const referral = Number(row.referral_leads ?? 0);
  const tradeShow = Number(row.trade_show_leads ?? 0);
  const socialMedia = Number(row.social_media_leads ?? 0);
  const split = phone + email + referral + tradeShow + socialMedia;
  return split > 0 ? split : Number(row.lead_count ?? 0);
}

function mapOfflineLeadCounts(row: {
  phone_leads?: number | null;
  email_leads?: number | null;
  referral_leads?: number | null;
  trade_show_leads?: number | null;
  social_media_leads?: number | null;
}) {
  return {
    phone_leads: Number(row.phone_leads ?? 0),
    email_leads: Number(row.email_leads ?? 0),
    referral_leads: Number(row.referral_leads ?? 0),
    trade_show_leads: Number(row.trade_show_leads ?? 0),
    social_media_leads: Number(row.social_media_leads ?? 0),
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
  _range: DateRange,
  period: PeriodKey = "month",
): Promise<BrandPeriodMetrics> {
  const supabase = getSupabaseAdmin();
  const today = utcTodayIso();
  const { data: latestSync } = await supabase
    .from("sync_logs")
    .select("created_at")
    .eq("brand_id", brandId)
    .eq("status", "success")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const syncedToday = Boolean(
    latestSync?.created_at && easternDateFromTimestamp(String(latestSync.created_at)) === today,
  );
  const asOf = getSnapshotAsOf(period, syncedToday);
  const periodRange = _range;
  const previousRange = getPreviousPeriodRange(period);
  const to = asOf.current;
  const rowLimit = 5000;

  const [
    { data: ga4, error: ga4Error },
    { data: gsc, error: gscError },
    { data: ads, error: adsError },
    { data: leads, error: leadsError },
    webCurrent,
    webPrevious,
  ] = await Promise.all([
    supabase
      .from("ga4_metrics")
      .select("date, sessions, conversions, organic_sessions, new_users, ai_referral_breakdown")
      .eq("brand_id", brandId)
      .lte("date", to)
      .limit(rowLimit),
    supabase
      .from("gsc_metrics")
      .select("date, clicks, impressions, ctr, avg_position, keywords_top3, total_keywords")
      .eq("brand_id", brandId)
      .lte("date", to)
      .limit(rowLimit),
    supabase
      .from("ads_metrics")
      .select("date, source, spend, leads, clicks, impressions")
      .eq("brand_id", brandId)
      .gte("date", previousRange.start)
      .lte("date", periodRange.end)
      .limit(rowLimit),
    supabase
      .from("manual_leads")
      .select("week_start_date, lead_count, phone_leads, email_leads, referral_leads, trade_show_leads, social_media_leads")
      .eq("brand_id", brandId)
      .gte("week_start_date", previousRange.start)
      .lte("week_start_date", periodRange.end)
      .limit(rowLimit),
    sumWebLeads(brandId, periodRange.start, webLeadsEnd(periodRange.end)),
    sumWebLeads(brandId, previousRange.start, webLeadsEnd(previousRange.end)),
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
            .lte("date", to)
            .limit(rowLimit)
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
            .lte("date", to)
            .limit(rowLimit)
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
            .gte("date", previousRange.start)
            .lte("date", periodRange.end)
            .limit(rowLimit)
        ).data
      : adsError
        ? (() => {
            throw new Error(adsError.message);
          })()
        : ads;

  const leadsData =
    leadsError && missingColumn(leadsError.message)
      ? (
          await supabase
            .from("manual_leads")
            .select("week_start_date, lead_count, phone_leads, email_leads, referral_leads, trade_show_leads")
            .eq("brand_id", brandId)
            .gte("week_start_date", previousRange.start)
            .lte("week_start_date", periodRange.end)
            .limit(rowLimit)
        ).data ??
        (
          await supabase
            .from("manual_leads")
            .select("week_start_date, lead_count")
            .eq("brand_id", brandId)
            .gte("week_start_date", previousRange.start)
            .lte("week_start_date", periodRange.end)
            .limit(rowLimit)
        ).data
      : leadsError
        ? (() => {
            throw new Error(leadsError.message);
          })()
        : leads;

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
  const leadRows = (leadsData ?? []).map((row) => ({
    date: row.week_start_date as string,
    lead_count: Number(row.lead_count ?? 0),
    ...mapOfflineLeadCounts(row as {
      phone_leads?: number | null;
      email_leads?: number | null;
      referral_leads?: number | null;
      trade_show_leads?: number | null;
      social_media_leads?: number | null;
    }),
  }));

  const currentGa4 = through(ga4Rows, asOf.current);
  const previousGa4 = through(ga4Rows, asOf.previous);
  const currentGa4Period = inRange(ga4Rows, periodRange);
  const previousGa4Period = inRange(ga4Rows, previousRange);
  const currentGsc = through(gscRows, asOf.current);
  const previousGsc = through(gscRows, asOf.previous);
  const currentGscPeriod = inRange(gscRows, periodRange);
  const previousGscPeriod = inRange(gscRows, previousRange);
  const currentLeads = inRange(leadRows, periodRange);
  const previousLeads = inRange(leadRows, previousRange);
  const currentAds = inRange(adsRows, periodRange);
  const previousAds = inRange(adsRows, previousRange);

  const gscRollup = (rows: typeof gscRows, asOfDate: string) => {
    const clicks = sum(rows.map((row) => Number(row.clicks ?? 0)));
    const impressions = sum(rows.map((row) => Number(row.impressions ?? 0)));
    const positions = rows
      .filter((row) => row.avg_position != null)
      .map((row) => Number(row.avg_position));
    const weights = rows.filter((row) => row.avg_position != null).map((row) => Number(row.impressions ?? 0));
    const latest = lastThrough(rows, asOfDate);
    return {
      clicks,
      impressions,
      ctr: impressions === 0 ? 0 : clicks / impressions,
      avgPosition: positions.length ? weightedAverage(positions, weights) : 0,
      keywordsTop3: Number(latest?.keywords_top3 ?? 0),
      totalKeywords: Number(latest?.total_keywords ?? 0),
    };
  };

  const currentSeo = gscRollup(currentGscPeriod, periodRange.end);
  const previousSeo = gscRollup(previousGscPeriod, previousRange.end);
  const currentSeoSnapshot = gscRollup(currentGsc, asOf.current);
  const previousSeoSnapshot = gscRollup(previousGsc, asOf.previous);

  const currentGoogle = adsSlice(currentAds, "google");
  const previousGoogle = adsSlice(previousAds, "google");
  const currentMeta = adsSlice(currentAds, "meta");
  const previousMeta = adsSlice(previousAds, "meta");
  const currentAi = aiBreakdown(currentGa4Period);
  const previousAi = aiBreakdown(previousGa4Period);
  const currentAiTotal = sum(Object.values(currentAi));
  const previousAiTotal = sum(Object.values(previousAi));

  const currentOffline = sum(currentLeads.map((row) => offlineTotal(row)));
  const previousOffline = sum(previousLeads.map((row) => offlineTotal(row)));

  const aiReferrals = Object.fromEntries(
    AI_REFERRAL_PATTERNS.map((pattern) => [pattern.key, metric(currentAi[pattern.key], previousAi[pattern.key])]),
  ) as Record<AiReferralKey, MetricValue>;

  return {
    snapshotCurrent: asOf.current,
    snapshotPrevious: asOf.previous,
    sessions: metric(sum(currentGa4.map((row) => Number(row.sessions ?? 0))), sum(previousGa4.map((row) => Number(row.sessions ?? 0)))),
    conversions: metric(sum(currentGa4.map((row) => Number(row.conversions ?? 0))), sum(previousGa4.map((row) => Number(row.conversions ?? 0)))),
    organicTraffic: metric(
      sum(currentGa4Period.map((row) => Number(row.organic_sessions ?? 0))),
      sum(previousGa4Period.map((row) => Number(row.organic_sessions ?? 0))),
    ),
    newUsers: metric(
      sum(currentGa4Period.map((row) => Number(row.new_users ?? 0))),
      sum(previousGa4Period.map((row) => Number(row.new_users ?? 0))),
    ),
    clicks: metric(currentSeo.clicks, previousSeo.clicks),
    impressions: metric(currentSeo.impressions, previousSeo.impressions),
    organicReach: metric(currentSeo.impressions, previousSeo.impressions),
    ctr: metric(currentSeo.ctr * 100, previousSeo.ctr * 100),
    avgPosition: metric(currentSeoSnapshot.avgPosition, previousSeoSnapshot.avgPosition),
    keywordsTop3: metric(currentSeoSnapshot.keywordsTop3, previousSeoSnapshot.keywordsTop3),
    totalKeywords: metric(currentSeoSnapshot.totalKeywords, previousSeoSnapshot.totalKeywords),
    googleSpend: metric(currentGoogle.spend, previousGoogle.spend),
    googleImpressions: metric(currentGoogle.impressions, previousGoogle.impressions),
    googleClicks: metric(currentGoogle.clicks, previousGoogle.clicks),
    googleCpc: metric(ratio(currentGoogle.spend, currentGoogle.clicks), ratio(previousGoogle.spend, previousGoogle.clicks)),
    googleConversions: metric(currentGoogle.leads, previousGoogle.leads),
    googleCostPerConversion: metric(
      ratio(currentGoogle.spend, currentGoogle.leads),
      ratio(previousGoogle.spend, previousGoogle.leads),
    ),
    adsCostPerConversion: metric(
      ratio(currentGoogle.spend + currentMeta.spend, currentGoogle.leads + currentMeta.leads),
      ratio(previousGoogle.spend + previousMeta.spend, previousGoogle.leads + previousMeta.leads),
    ),
    metaSpend: metric(currentMeta.spend, previousMeta.spend),
    metaImpressions: metric(currentMeta.impressions, previousMeta.impressions),
    metaClicks: metric(currentMeta.clicks, previousMeta.clicks),
    metaCpc: metric(ratio(currentMeta.spend, currentMeta.clicks), ratio(previousMeta.spend, previousMeta.clicks)),
    metaLeads: metric(currentMeta.leads, previousMeta.leads),
    metaCtr: metric(ratio(currentMeta.clicks, currentMeta.impressions) * 100, ratio(previousMeta.clicks, previousMeta.impressions) * 100),
    metaCostPerLead: metric(ratio(currentMeta.spend, currentMeta.leads), ratio(previousMeta.spend, previousMeta.leads)),
    adLeads: metric(currentGoogle.leads + currentMeta.leads, previousGoogle.leads + previousMeta.leads),
    weeklyLeads: metric(currentOffline + webCurrent, previousOffline + webPrevious),
    webLeads: metric(webCurrent, webPrevious),
    offlineLeads: metric(currentOffline, previousOffline),
    totalLeads: metric(currentOffline + webCurrent, previousOffline + webPrevious),
    aiTotal: metric(currentAiTotal, previousAiTotal),
    aiReferrals,
  };
}

export async function listRecentLeads(brandId: string, limit = 8): Promise<OfflineLeadRow[]> {
  const supabase = getSupabaseAdmin();
  const full = await supabase
    .from("manual_leads")
    .select("id, week_start_date, lead_count, phone_leads, email_leads, referral_leads, trade_show_leads, social_media_leads")
    .eq("brand_id", brandId)
    .order("week_start_date", { ascending: false })
    .limit(limit);
  const withoutSocial =
    full.error && /does not exist|schema cache/i.test(full.error.message)
      ? await supabase
          .from("manual_leads")
          .select("id, week_start_date, lead_count, phone_leads, email_leads, referral_leads, trade_show_leads")
          .eq("brand_id", brandId)
          .order("week_start_date", { ascending: false })
          .limit(limit)
      : full;
  const { data, error } =
    withoutSocial.error && /does not exist|schema cache/i.test(withoutSocial.error.message)
      ? await supabase
          .from("manual_leads")
          .select("id, week_start_date, lead_count")
          .eq("brand_id", brandId)
          .order("week_start_date", { ascending: false })
          .limit(limit)
      : withoutSocial;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    week_start_date: row.week_start_date as string,
    lead_count: Number(row.lead_count ?? 0),
    ...mapOfflineLeadCounts(row as {
      phone_leads?: number | null;
      email_leads?: number | null;
      referral_leads?: number | null;
      trade_show_leads?: number | null;
      social_media_leads?: number | null;
    }),
  }));
}

export async function upsertWeeklyLeads(input: {
  brandId: string;
  weekStartDate: string;
  phoneLeads: number;
  emailLeads: number;
  referralLeads: number;
  tradeShowLeads: number;
  socialMediaLeads: number;
  enteredBy: string;
}) {
  const phoneLeads = Math.max(0, Math.round(input.phoneLeads));
  const emailLeads = Math.max(0, Math.round(input.emailLeads));
  const referralLeads = Math.max(0, Math.round(input.referralLeads));
  const tradeShowLeads = Math.max(0, Math.round(input.tradeShowLeads));
  const socialMediaLeads = Math.max(0, Math.round(input.socialMediaLeads));
  const leadCount = phoneLeads + emailLeads + referralLeads + tradeShowLeads + socialMediaLeads;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("manual_leads").upsert(
    {
      brand_id: input.brandId,
      week_start_date: input.weekStartDate,
      lead_count: leadCount,
      phone_leads: phoneLeads,
      email_leads: emailLeads,
      referral_leads: referralLeads,
      trade_show_leads: tradeShowLeads,
      social_media_leads: socialMediaLeads,
      entered_by: input.enteredBy,
    },
    { onConflict: "brand_id,week_start_date" },
  );
  if (error) throw new Error(error.message);
}
