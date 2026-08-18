import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGscForBrand } from "@/lib/integrations/gsc";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const endDate = new Date();
  endDate.setUTCDate(endDate.getUTCDate() - 1);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  const start = startDate.toISOString().slice(0, 10);
  const end = endDate.toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    (brands ?? []).map((b) => syncGscForBrand(b.id as string, start, end)),
  );

  const failures = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
