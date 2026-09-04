import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { syncGoogleMetrics } from "@/lib/integrations/sync-google";
import { DASHBOARD_SYNC_DAYS } from "@/lib/integrations/sync-window";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Sign in required" }, { status: 401 });
  }
  if (user.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const days = Math.min(
    DASHBOARD_SYNC_DAYS,
    Math.max(1, Number(url.searchParams.get("days") ?? DASHBOARD_SYNC_DAYS) || DASHBOARD_SYNC_DAYS),
  );

  try {
    const result = await syncGoogleMetrics(days);
    const failed = result.brands.some(
      (brand) =>
        ("ok" in brand.ga4 && brand.ga4.ok === false) ||
        ("ok" in brand.gsc && brand.gsc.ok === false) ||
        ("ok" in brand.ads && brand.ads.ok === false) ||
        ("ok" in brand.meta && brand.meta.ok === false),
    );
    return NextResponse.json({ ok: !failed, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
