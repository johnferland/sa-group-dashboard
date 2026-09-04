import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGoogleAdsForBrand } from "@/lib/integrations/google-ads";
import { CRON_SYNC_DAYS, syncDateRange } from "@/lib/integrations/sync-window";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const { startDate, endDate } = syncDateRange(CRON_SYNC_DAYS);

  const results = await Promise.allSettled(
    (brands ?? []).map((brand) => syncGoogleAdsForBrand(brand.id as string, startDate, endDate)),
  );

  const failures = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
