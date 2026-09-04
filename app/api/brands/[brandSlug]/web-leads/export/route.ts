import { NextResponse } from "next/server";
import { canAccessBrand, getCurrentAppUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { isIsoDate, orderedDateRange } from "@/lib/period";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listWebLeadsInRange, webLeadDate } from "@/lib/web-leads";

export const dynamic = "force-dynamic";

function pickDate(searchParams: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = searchParams.get(key) ?? undefined;
    if (isIsoDate(value)) return value;
  }
  return undefined;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string }> },
) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  }

  const { brandSlug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, slug")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (brandError) {
    return NextResponse.json({ ok: false, error: brandError.message }, { status: 500 });
  }
  if (!brand) {
    return NextResponse.json({ ok: false, error: "Brand not found." }, { status: 404 });
  }
  if (!canAccessBrand(user, brand.id as string)) {
    return NextResponse.json({ ok: false, error: "No access." }, { status: 403 });
  }

  const searchParams = new URL(request.url).searchParams;
  const from = pickDate(searchParams, ["leads_from", "from"]);
  const to = pickDate(searchParams, ["leads_to", "to"]);
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: "leads_from and leads_to are required." }, { status: 400 });
  }
  const range = orderedDateRange(from, to);
  const rows = await listWebLeadsInRange({
    brandId: brand.id as string,
    start: range.start,
    end: range.end,
  });

  const csv = toCsv(
    ["Date", "First name", "Last name", "Email", "Source", "Count"],
    rows.map((row) => [
      webLeadDate(row),
      row.first_name,
      row.last_name,
      row.email,
      row.source,
      String(row.count),
    ]),
  );

  const filename = `${brand.slug}-web-leads-${range.start}-to-${range.end}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
