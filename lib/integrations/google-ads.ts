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

function isAdsPermissionError(message: string): boolean {
  return /login-customer-id|doesn't have permission|not accessible|USER_PERMISSION_DENIED/i.test(message);
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

async function searchCampaignMetrics(input: {
  customerId: string;
  loginCustomerId?: string | null;
  accessToken: string;
  developerToken: string;
  query: string;
}): Promise<NonNullable<AdsSearchResponse["results"]>> {
  const version = adsApiVersion();
  const results: NonNullable<AdsSearchResponse["results"]> = [];
  let pageToken: string | undefined;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${input.accessToken}`,
    "developer-token": input.developerToken,
    "Content-Type": "application/json",
  };
  if (input.loginCustomerId) headers["login-customer-id"] = input.loginCustomerId;

  do {
    const response = await fetch(
      `https://googleads.googleapis.com/${version}/customers/${encodeURIComponent(input.customerId)}/googleAds:search`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          query: input.query,
          pageSize: 10000,
          ...(pageToken ? { pageToken } : {}),
        }),
      },
    );
    const data = (await response.json()) as AdsSearchResponse;
    if (!response.ok || data.error) {
      throw new Error(adsErrorMessage(data, response.status));
    }
    results.push(...(data.results ?? []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return results;
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

  const mccId = digitsOnly(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "");
  const accessToken = await getGoogleAccessToken();
  const query = `SELECT segments.date, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;

  // IDA-style clients live inside the MCC and need login-customer-id.
  // ODL-style accounts are linked but not a child — retry without the MCC header, then as self.
  const loginAttempts: Array<{ label: string; loginCustomerId: string | null }> = [];
  if (mccId && mccId !== customerId) loginAttempts.push({ label: "MCC", loginCustomerId: mccId });
  loginAttempts.push({ label: "direct", loginCustomerId: null });
  loginAttempts.push({ label: "self", loginCustomerId: customerId });

  let results: NonNullable<AdsSearchResponse["results"]> | null = null;
  let usedLogin = "direct";
  let lastError = "";

  for (const attempt of loginAttempts) {
    try {
      results = await searchCampaignMetrics({
        customerId,
        loginCustomerId: attempt.loginCustomerId,
        accessToken,
        developerToken,
        query,
      });
      usedLogin = attempt.label;
      break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Google Ads sync failed";
      if (!isAdsPermissionError(lastError)) throw new Error(lastError);
    }
  }

  if (!results) {
    throw new Error(
      lastError ||
        "Could not access this Google Ads account via the MCC or as a linked account. Keep GOOGLE_ADS_LOGIN_CUSTOMER_ID as the MCC for clients inside it.",
    );
  }

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
    message: `Wrote ${rows.length} day(s) ${startDate}–${endDate} via ${usedLogin} login`,
  });

  return {
    brandId,
    days: rows.length,
    spend: rows.reduce((sum, row) => sum + row.spend, 0),
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    leads: rows.reduce((sum, row) => sum + row.leads, 0),
  };
}
