import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGa4ForBrand } from "@/lib/integrations/ga4";
import { CRON_SYNC_DAYS, syncDateRange } from "@/lib/integrations/sync-window";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const { startDate, endDate } = syncDateRange(CRON_SYNC_DAYS);

  const results = await Promise.allSettled(
    (brands ?? []).map((brand) => syncGa4ForBrand(brand.id as string, startDate, endDate)),
  );

  const failures = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
