import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGscForBrand } from "@/lib/integrations/gsc";
import { CRON_SYNC_DAYS, syncDateRange } from "@/lib/integrations/sync-window";

export const maxDuration = 300;

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const { startDate, endDate } = syncDateRange(CRON_SYNC_DAYS);

  const results = await Promise.allSettled(
    (brands ?? []).map(async (brand) => {
      try {
        return await syncGscForBrand(brand.id as string, startDate, endDate);
      } catch (error) {
        await supabase.from("sync_logs").insert({
          brand_id: brand.id,
          source: "gsc",
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }),
  );

  const failures = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
