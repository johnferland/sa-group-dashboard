import { getSupabaseAdmin } from "@/lib/supabase";
import { formatGa4Date, getGoogleAccessToken } from "@/lib/integrations/google-auth";

const AI_REFERRAL_PATTERNS = [
  { key: "chatgpt", match: "chatgpt.com" },
  { key: "perplexity", match: "perplexity.ai" },
  { key: "gemini", match: "gemini.google.com" },
  { key: "claude", match: "claude.ai" },
  { key: "copilot", match: "copilot.microsoft.com" },
  { key: "bing", match: "bing.com" },
] as const;

type RunReportResponse = {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
  error?: { message?: string; status?: string };
};

export type Ga4SyncResult = {
  brandId: string;
  days: number;
  sessions: number;
  conversions: number;
};

function normalizePropertyId(raw: string): string {
  return raw.trim().replace(/^properties\//, "");
}

function classifyAiSource(source: string): string | null {
  const lower = source.toLowerCase();
  const hit = AI_REFERRAL_PATTERNS.find((pattern) => lower.includes(pattern.match));
  return hit?.key ?? null;
}

async function runReport(
  propertyId: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<RunReportResponse> {
  const response = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = (await response.json()) as RunReportResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `GA4 API error ${response.status}`);
  }
  return data;
}

async function fetchDailySessions(propertyId: string, accessToken: string, startDate: string, endDate: string) {
  const report = await runReport(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }, { name: "keyEvents" }],
    limit: 1000,
  });

  const byDate = new Map<string, { sessions: number; conversions: number }>();
  for (const row of report.rows ?? []) {
    const date = formatGa4Date(row.dimensionValues?.[0]?.value ?? "");
    if (!date) continue;
    byDate.set(date, {
      sessions: Number(row.metricValues?.[0]?.value ?? 0),
      conversions: Number(row.metricValues?.[1]?.value ?? 0),
    });
  }
  return byDate;
}

async function fetchDailyAiReferrals(propertyId: string, accessToken: string, startDate: string, endDate: string) {
  const report = await runReport(propertyId, accessToken, {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "sessionSource" }],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      orGroup: {
        expressions: AI_REFERRAL_PATTERNS.map((pattern) => ({
          filter: {
            fieldName: "sessionSource",
            stringFilter: { matchType: "CONTAINS", value: pattern.match },
          },
        })),
      },
    },
    limit: 10000,
  });

  const byDate = new Map<string, Record<string, number>>();
  for (const row of report.rows ?? []) {
    const date = formatGa4Date(row.dimensionValues?.[0]?.value ?? "");
    const source = classifyAiSource(row.dimensionValues?.[1]?.value ?? "");
    const sessions = Number(row.metricValues?.[0]?.value ?? 0);
    if (!date || !source) continue;
    const current = byDate.get(date) ?? {};
    current[source] = (current[source] ?? 0) + sessions;
    byDate.set(date, current);
  }
  return byDate;
}

export async function syncGa4ForBrand(
  brandId: string,
  startDate: string,
  endDate = startDate,
): Promise<Ga4SyncResult> {
  const supabase = getSupabaseAdmin();
  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("ga4_property_id")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (credError) throw new Error(credError.message);
  if (!creds?.ga4_property_id) throw new Error("Missing GA4 property ID");

  const propertyId = normalizePropertyId(creds.ga4_property_id as string);
  const accessToken = await getGoogleAccessToken();
  const [daily, aiByDate] = await Promise.all([
    fetchDailySessions(propertyId, accessToken, startDate, endDate),
    fetchDailyAiReferrals(propertyId, accessToken, startDate, endDate),
  ]);

  const rows = [...daily.entries()].map(([date, metrics]) => ({
    brand_id: brandId,
    date,
    sessions: metrics.sessions,
    conversions: metrics.conversions,
    ai_referral_breakdown: aiByDate.get(date) ?? {},
  }));

  if (rows.length > 0) {
    const { error } = await supabase.from("ga4_metrics").upsert(rows, { onConflict: "brand_id,date" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("sync_logs").insert({
    brand_id: brandId,
    source: "ga4",
    status: "success",
    message: `Wrote ${rows.length} day(s) ${startDate}–${endDate}`,
  });

  return {
    brandId,
    days: rows.length,
    sessions: rows.reduce((sum, row) => sum + row.sessions, 0),
    conversions: rows.reduce((sum, row) => sum + row.conversions, 0),
  };
}
