import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { syncGscForBrand } from "@/lib/integrations/gsc";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data: brands } = await supabase.from("brands").select("id");
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    (brands ?? []).map((b) => syncGscForBrand(b.id as string, today)),
  );

  const failures = results.filter((r) => r.status === "rejected").length;
  return NextResponse.json({ ok: failures === 0, total: results.length, failures });
}
