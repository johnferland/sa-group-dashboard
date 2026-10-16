import { getSupabaseAdmin } from "@/lib/supabase";
import { getGoogleAccessToken } from "@/lib/integrations/google-auth";
import { KEYWORD_SYNC_DAYS } from "@/lib/integrations/sync-window";

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

function addCalendarDays(iso: string, amount: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const next = new Date(year, month - 1, day + amount);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, "0");
  const d = String(next.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateChunks(startDate: string, endDate: string, chunkDays = 7): Array<{ start: string; end: string }> {
  const chunks: Array<{ start: string; end: string }> = [];
  let start = startDate;
  while (start <= endDate) {
    let end = addCalendarDays(start, chunkDays - 1);
    if (end > endDate) end = endDate;
    chunks.push({ start, end });
    start = addCalendarDays(end, 1);
  }
  return chunks;
}

async function queryGsc(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 1000,
  startRow = 0,
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
        startRow,
      }),
    },
  );
  const data = (await response.json()) as GscQueryResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `GSC API error ${response.status}`);
  }
  return data;
}

async function queryGscAllRows(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
  dimensions: string[],
  rowLimit = 25000,
): Promise<GscQueryResponse> {
  const rows: NonNullable<GscQueryResponse["rows"]> = [];
  let startRow = 0;
  while (true) {
    const page = await queryGsc(siteUrl, accessToken, startDate, endDate, dimensions, rowLimit, startRow);
    const batch = page.rows ?? [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
    startRow += rowLimit;
    if (startRow >= 100000) break;
  }
  return { rows };
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function fetchKeywordData(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<Map<string, { keywordsTop3: number; totalKeywords: number }>> {
  const chunks = dateChunks(startDate, endDate, 14);
  const parts = await mapPool(chunks, 4, async (chunk) => {
    try {
      const report = await queryGscAllRows(siteUrl, accessToken, chunk.start, chunk.end, ["date", "query"]);
      return keywordCountsByDate(report);
    } catch (error) {
      console.error("GSC keyword pull failed", chunk, error);
      return new Map<string, { keywordsTop3: number; totalKeywords: number }>();
    }
  });
  const byDate = new Map<string, { keywordsTop3: number; totalKeywords: number }>();
  for (const part of parts) {
    for (const [date, counts] of part) {
      byDate.set(date, counts);
    }
  }
  return byDate;
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
      const report = await queryGsc(candidate, accessToken, startDate, endDate, ["date"], 25000);
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

  const keywordStart =
    startDate > addCalendarDays(endDate, 1 - KEYWORD_SYNC_DAYS)
      ? startDate
      : addCalendarDays(endDate, 1 - KEYWORD_SYNC_DAYS);
  const keywordByDate = await fetchKeywordData(siteUrl, accessToken, keywordStart, endDate);

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
        ...(keywords
          ? { keywords_top3: keywords.keywordsTop3, total_keywords: keywords.totalKeywords }
          : {}),
      };
    })
    .filter((row) => row.date);

  if (rows.length > 0) {
    const { error } = await supabase.from("gsc_metrics").upsert(rows, {
      onConflict: "brand_id,date",
      // Missing keyword fields must keep DB defaults / existing values, not become NULL.
      defaultToNull: false,
    });
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
