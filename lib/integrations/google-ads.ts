import { getSupabaseAdmin } from "@/lib/supabase";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";

type AdsSearchResponse = {
  results?: Array<{
    segments?: { date?: string };
    metrics?: {
      costMicros?: string | number;
      clicks?: string | number;
      impressions?: string | number;
      conversions?: string | number;
    };
  }>;
  nextPageToken?: string;
  error?: {
    message?: string;
    status?: string;
    details?: Array<{
      errors?: Array<{ message?: string; errorCode?: Record<string, string> }>;
    }>;
  };
};

export type GoogleAdsSyncResult = {
  brandId: string;
  days: number;
  spend: number;
  clicks: number;
  leads: number;
};

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function adsApiVersion(): string {
  return process.env.GOOGLE_ADS_API_VERSION?.trim() || "v25";
}

function adsErrorMessage(data: AdsSearchResponse, status: number): string {
  const detailMessages =
    data.error?.details
      ?.flatMap((detail) => detail.errors ?? [])
      .map((item) => item.message)
      .filter((message): message is string => Boolean(message)) ?? [];
  if (detailMessages.length > 0) return detailMessages.join("; ");
  return data.error?.message ?? `Google Ads API error ${status}`;
}

export async function syncGoogleAdsForBrand(
  brandId: string,
  startDate: string,
  endDate = startDate,
): Promise<GoogleAdsSyncResult> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!developerToken) {
    throw new Error("Set GOOGLE_ADS_DEVELOPER_TOKEN in .env.local (and Vercel) to sync Google Ads.");
  }

  const supabase = getSupabaseAdmin();
  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("google_ads_customer_id")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (credError) throw new Error(credError.message);
  if (!creds?.google_ads_customer_id) throw new Error("Missing Google Ads customer ID");

  const customerId = digitsOnly(creds.google_ads_customer_id as string);
  if (!customerId) throw new Error("Google Ads customer ID is empty after removing dashes.");

  const loginCustomerId = digitsOnly(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "");
  if (!loginCustomerId) {
    throw new Error(
      "Set GOOGLE_ADS_LOGIN_CUSTOMER_ID to the MCC (parent) account ID. Each company field should be the client/sub-account only.",
    );
  }
  const accessToken = await getGoogleAccessToken();
  const version = adsApiVersion();
  const query = `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;
  const results: NonNullable<AdsSearchResponse["results"]> = [];
  let pageToken: string | undefined;

  do {
    const response = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${encodeURIComponent(customerId)}/googleAds:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": developerToken,
          "login-customer-id": loginCustomerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          pageSize: 10000,
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );

    const data = (await response.json()) as AdsSearchResponse;
    if (!response.ok || data.error) {
      const message = adsErrorMessage(data, response.status);
      if (/login-customer-id|doesn't have permission/i.test(message)) {
        throw new Error(
          `${message} Confirm GOOGLE_ADS_LOGIN_CUSTOMER_ID is the MCC parent that manages this client ID.`,
        );
      }
      throw new Error(message);
    }
    results.push(...(data.results ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  const byDate = new Map<string, { spend: number; clicks: number; impressions: number; leads: number }>();
  for (const row of results) {
    const date = row.segments?.date;
    if (!date) continue;
    const current = byDate.get(date) ?? { spend: 0, clicks: 0, impressions: 0, leads: 0 };
    current.spend += Number(row.metrics?.costMicros ?? 0) / 1_000_000;
    current.clicks += Number(row.metrics?.clicks ?? 0);
    current.impressions += Number(row.metrics?.impressions ?? 0);
    current.leads += Math.round(Number(row.metrics?.conversions ?? 0));
    byDate.set(date, current);
  }

  const rows = [...byDate.entries()].map(([date, metrics]) => ({
    brand_id: brandId,
    date,
    source: "google" as const,
    spend: metrics.spend,
    clicks: Math.round(metrics.clicks),
    impressions: Math.round(metrics.impressions),
    leads: metrics.leads,
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("ads_metrics").upsert(rows, { onConflict: "brand_id,date,source" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("sync_logs").insert({
    brand_id: brandId,
    source: "google_ads",
    status: "success",
    message: `Wrote ${rows.length} day(s) ${startDate}–${endDate}`,
  });

  return {
    brandId,
    days: rows.length,
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    leads: rows.reduce((sum, row) => sum + row.leads, 0),
  };
}
