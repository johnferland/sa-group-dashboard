import { getSupabaseAdmin } from "@/lib/supabase";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";

type GscQueryResponse = {
  rows?: Array<{
    keys?: string[];
    clicks?: number;
    impressions?: number;
    ctr?: number;
    position?: number;
  }>;
  error?: { message?: string };
};

export type GscSyncResult = {
  brandId: string;
  days: number;
  clicks: number;
  impressions: number;
  siteUrl: string;
};

function gscSiteCandidates(siteUrl: string): string[] {
  const raw = siteUrl.trim();
  const withoutProtocol = raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  const host = withoutProtocol.replace(/^www\./i, "");
  const candidates = [
    raw,
    `https://${withoutProtocol}/`,
    `https://${withoutProtocol}`,
    `https://www.${host}/`,
    `https://${host}/`,
    `sc-domain:${host}`,
  ];
  return [...new Set(candidates.filter(Boolean))];
}

async function queryGsc(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 1000,
): Promise<GscQueryResponse> {
  const encodedSite = encodeURIComponent(siteUrl);
  const response = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        dimensions,
        rowLimit,
      }),
    },
  );
  const data = (await response.json()) as GscQueryResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `GSC API error ${response.status}`);
  }
  return data;
}

function keywordCountsByDate(report: GscQueryResponse): Map<string, { keywordsTop3: number; totalKeywords: number }> {
  const byDate = new Map<string, { keywordsTop3: number; totalKeywords: number }>();
  for (const row of report.rows ?? []) {
    const date = row.keys?.[0] ?? "";
    if (!date) continue;
    const current = byDate.get(date) ?? { keywordsTop3: 0, totalKeywords: 0 };
    current.totalKeywords += 1;
    if (Number(row.position ?? 100) <= 3) current.keywordsTop3 += 1;
    byDate.set(date, current);
  }
  return byDate;
}

async function queryGscWithFallback(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<{ siteUrl: string; report: GscQueryResponse }> {
  const candidates = gscSiteCandidates(siteUrl);
  let lastError = "No GSC site URL variant worked";

  for (const candidate of candidates) {
    try {
      const report = await queryGsc(candidate, accessToken, startDate, endDate, ["date"]);
      return { siteUrl: candidate, report };
    } catch (error) {
      lastError = `${candidate}: ${error instanceof Error ? error.message : "failed"}`;
    }
  }

  throw new Error(lastError);
}

export async function syncGscForBrand(
  brandId: string,
  startDate: string,
  endDate = startDate,
): Promise<GscSyncResult> {
  const supabase = getSupabaseAdmin();
  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("gsc_site_url")
    .eq("brand_id", brandId)
    .maybeSingle();

  if (credError) throw new Error(credError.message);
  if (!creds?.gsc_site_url) throw new Error("Missing GSC site URL");

  const accessToken = await getGoogleAccessToken();
  const { siteUrl, report } = await queryGscWithFallback(
    creds.gsc_site_url as string,
    accessToken,
    startDate,
    endDate,
  );

  if (siteUrl !== creds.gsc_site_url) {
    await supabase
      .from("brand_credentials")
      .update({ gsc_site_url: siteUrl, updated_at: new Date().toISOString() })
      .eq("brand_id", brandId);
  }

  let keywordByDate = new Map<string, { keywordsTop3: number; totalKeywords: number }>();
  try {
    const queryReport = await queryGsc(siteUrl, accessToken, startDate, endDate, ["date", "query"], 25000);
    keywordByDate = keywordCountsByDate(queryReport);
  } catch {
    keywordByDate = new Map();
  }

  const rows = (report.rows ?? [])
    .map((row) => {
      const date = row.keys?.[0] ?? "";
      const keywords = keywordByDate.get(date);
      return {
        brand_id: brandId,
        date,
        clicks: Math.round(Number(row.clicks ?? 0)),
        impressions: Math.round(Number(row.impressions ?? 0)),
        ctr: Number(row.ctr ?? 0),
        avg_position: row.position == null ? null : Number(row.position),
        keywords_top3: keywords?.keywordsTop3 ?? 0,
        total_keywords: keywords?.totalKeywords ?? 0,
      };
    })
    .filter((row) => row.date);

  if (rows.length > 0) {
    const { error } = await supabase.from("gsc_metrics").upsert(rows, { onConflict: "brand_id,date" });
    if (error) throw new Error(error.message);
  }

  await supabase.from("sync_logs").insert({
    brand_id: brandId,
    source: "gsc",
    status: "success",
    message: `Wrote ${rows.length} day(s) ${startDate}–${endDate} using ${siteUrl}`,
  });

  return {
    brandId,
    days: rows.length,
    clicks: rows.reduce((sum, row) => sum + row.clicks, 0),
    impressions: rows.reduce((sum, row) => sum + row.impressions, 0),
    siteUrl,
  };
}
