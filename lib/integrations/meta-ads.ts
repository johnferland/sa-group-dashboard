import { getSupabaseAdmin } from "@/lib/supabase";

type MetaAction = { action_type?: string; value?: string };

type MetaInsightRow = {
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
};

type MetaInsightsResponse = {
  data?: MetaInsightRow[];
  paging?: { next?: string };
  error?: { message?: string; error_user_msg?: string };
};

export type MetaAdsSyncResult = {
  brandId: string;
  days: number;
  spend: number;
  clicks: number;
  leads: number;
};

const LEAD_ACTION_PRIORITY = [
  "lead",
  "offsite_conversion.fb_pixel_lead",
  "onsite_conversion.lead_grouped",
  "onsite_web_lead",
  "complete_registration",
  "omni_complete_registration",
] as const;

function digitsOnly(value: string): string {
  return value.replace(/^act_/i, "").replace(/\D/g, "");
}

function graphVersion(): string {
  return process.env.META_GRAPH_API_VERSION?.trim() || "v22.0";
}

function actionValue(actions: MetaAction[] | undefined, type: string): number {
  const hit = (actions ?? []).find((item) => item.action_type === type);
  return Number(hit?.value ?? 0);
}

function pickLeadAction(rows: MetaInsightRow[]): string | null {
  for (const type of LEAD_ACTION_PRIORITY) {
    if (rows.some((row) => actionValue(row.actions, type) > 0)) return type;
  }
  return null;
}

function metaErrorMessage(data: MetaInsightsResponse, status: number): string {
  return data.error?.error_user_msg || data.error?.message || `Meta Marketing API error ${status}`;
}

async function fetchInsightPage(url: string): Promise<MetaInsightsResponse> {
  const response = await fetch(url);
  const data = (await response.json()) as MetaInsightsResponse;
  if (!response.ok || data.error) {
    throw new Error(metaErrorMessage(data, response.status));
  }
  return data;
}

async function fetchDailyInsights(accountId: string, accessToken: string, startDate: string, endDate: string) {
  const params = new URLSearchParams({
    fields: "spend,impressions,clicks,inline_link_clicks,actions,date_start",
    time_increment: "1",
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    level: "account",
    limit: "500",
    use_unified_attribution_setting: "true",
    access_token: accessToken,
  });
  let next: string | undefined =
    `https://graph.facebook.com/${graphVersion()}/${encodeURIComponent(accountId)}/insights?${params.toString()}`;
  const rows: MetaInsightRow[] = [];

  while (next) {
    const page = await fetchInsightPage(next);
    rows.push(...(page.data ?? []));
    next = page.paging?.next;
  }

  return rows;
}

export async function syncMetaAdsForBrand(
  brandId: string,
  startDate: string,
  endDate = startDate,
): Promise<MetaAdsSyncResult> {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!accessToken) {
    throw new Error("Set META_SYSTEM_USER_TOKEN in .env.local (and Vercel) to sync Meta Ads.");
  }

  const supabase = getSupabaseAdmin();
  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("meta_ad_account_id")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (credError) throw new Error(credError.message);
  if (!creds?.meta_ad_account_id) throw new Error("Missing Meta ad account ID");

  const accountDigits = digitsOnly(creds.meta_ad_account_id as string);
  if (!accountDigits) throw new Error("Meta ad account ID is empty after removing act_ / dashes.");

  const insights = await fetchDailyInsights(`act_${accountDigits}`, accessToken, startDate, endDate);
  const leadAction = pickLeadAction(insights);

  const rows = insights
    .map((row) => {
      const date = row.date_start ?? "";
      const clicks = Number(row.inline_link_clicks ?? row.clicks ?? 0);
      return {
        brand_id: brandId,
        date,
        source: "meta" as const,
        spend: Number(row.spend ?? 0),
        clicks: Math.round(clicks),
        impressions: Math.round(Number(row.impressions ?? 0)),
        leads: Math.round(leadAction ? actionValue(row.actions, leadAction) : 0),
      };
    })
    .filter((row) => row.date);

  if (rows.length > 0) {
    const { error } = await supabase.from("ads_metrics").upsert(rows, { onConflict: "brand_id,date,source" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("sync_logs").insert({
    brand_id: brandId,
    source: "meta_ads",
    status: "success",
    message: `Wrote ${rows.length} day(s) ${startDate}–${endDate}${leadAction ? ` using ${leadAction}` : ""}`,
  });

  return {
    brandId,
    days: rows.length,
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    leads: rows.reduce((sum, row) => sum + row.leads, 0),
  };
}
