import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGoogleAdsForBrand } from "@/lib/integrations/google-ads";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    (brands ?? []).map((b) => syncGoogleAdsForBrand(b.id as string, today)),
  );

  const failures = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
