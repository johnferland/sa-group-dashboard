import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncMetaAdsForBrand } from "@/lib/integrations/meta-ads";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: creds } = await supabase
    .from("brand_credentials")
    .select("brand_id, meta_ad_account_id");
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const brands = (creds ?? []).filter((row) => row.meta_ad_account_id);
  const results = await Promise.allSettled(
    brands.map((row) => syncMetaAdsForBrand(row.brand_id as string, start, end)),
  );

  const failures = results.filter((result) => result.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
