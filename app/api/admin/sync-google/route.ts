import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { syncGoogleMetrics } from "@/lib/integrations/sync-google";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 14) || 14));

  try {
    const result = await syncGoogleMetrics(days);
    const failed = result.brands.some(
      (brand) =>
        ("ok" in brand.ga4 && brand.ga4.ok === false) ||
        ("ok" in brand.gsc && brand.gsc.ok === false) ||
        ("ok" in brand.ads && brand.ads.ok === false),
    );
    return NextResponse.json({ ok: !failed, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
