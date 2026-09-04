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

async function searchGoogleAds(input: {
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

async function listAccessibleCustomerIds(
  accessToken: string,
  developerToken: string,
): Promise<string[]> {
  const version = adsApiVersion();
  const response = await fetch(`https://googleads.googleapis.com/${version}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": developerToken,
    },
  });
  const data = (await response.json()) as { resourceNames?: string[]; error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Google Ads listAccessibleCustomers error ${response.status}`);
  }
  return [...new Set((data.resourceNames ?? []).map((name) => digitsOnly(name)).filter(Boolean))];
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

  let accessible: string[] = [];
  try {
    accessible = await listAccessibleCustomerIds(accessToken, developerToken);
  } catch {
    accessible = [];
  }

  // IDA is a child of the MCC. ODL is only linked, so try every manager this Google user
  // can log in as, then direct / self.
  const loginAttempts: Array<{ label: string; loginCustomerId: string | null }> = [];
  const seen = new Set<string>();
  const addAttempt = (label: string, loginCustomerId: string | null) => {
    const key = loginCustomerId ?? "direct";
    if (seen.has(key)) return;
    seen.add(key);
    loginAttempts.push({ label, loginCustomerId });
  };

  if (mccId) addAttempt("MCC", mccId);
  for (const managerId of accessible) {
    if (managerId === customerId) continue;
    addAttempt(`manager`, managerId);
  }
  addAttempt("direct", null);
  addAttempt("self", customerId);

  let results: NonNullable<AdsSearchResponse["results"]> | null = null;
  let usedLogin = "direct";
  const failedLogins: string[] = [];

  for (const attempt of loginAttempts) {
    try {
      results = await searchGoogleAds({
        customerId,
        loginCustomerId: attempt.loginCustomerId,
        accessToken,
        developerToken,
        query,
      });
      usedLogin = attempt.label;
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google Ads sync failed";
      failedLogins.push(attempt.label);
      if (!isAdsPermissionError(message)) throw new Error(message);
    }
  }

  if (!results) {
    const mccNote = mccId
      ? "MCC env is set"
      : "GOOGLE_ADS_LOGIN_CUSTOMER_ID is missing in this environment";
    throw new Error(
      `No Google Ads login worked for this company (${mccNote}; tried ${loginAttempts.length} login(s): ${failedLogins.join(", ")}). If ODL is linked but not a child of the IDA MCC, add the Google user to ODL or use ODL's own manager ID.`,
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
