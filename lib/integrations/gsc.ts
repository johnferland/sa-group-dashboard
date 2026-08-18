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
        dimensions: ["date"],
        rowLimit: 1000,
      }),
    },
  );
  const data = (await response.json()) as GscQueryResponse;
  if (!response.ok) {
    throw new Error(data.error?.message ?? `GSC API error ${response.status}`);
  }
  return data;
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
      const report = await queryGsc(candidate, accessToken, startDate, endDate);
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

  const rows = (report.rows ?? [])
    .map((row) => ({
      brand_id: brandId,
      date: row.keys?.[0] ?? "",
      clicks: Math.round(Number(row.clicks ?? 0)),
      impressions: Math.round(Number(row.impressions ?? 0)),
      ctr: Number(row.ctr ?? 0),
      avg_position: row.position == null ? null : Number(row.position),
    }))
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
