"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser, canLogWeeklyLeads } from "@/lib/auth";
import { upsertWeeklyLeads } from "@/lib/metrics";

export async function saveWeeklyLeadsAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

  const brandId = String(formData.get("brand_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  const weekStartDate = String(formData.get("week_start_date") ?? "");
  const leadCount = Number(formData.get("lead_count") ?? 0);
  const period = String(formData.get("period") ?? "week");

  if (!brandId || !weekStartDate) {
    redirect(`/brand/${brandSlug}?error=${encodeURIComponent("Week start date is required.")}`);
  }
  if (!canLogWeeklyLeads(user, brandId)) {
    redirect(`/brand/${brandSlug}?error=${encodeURIComponent("You cannot enter leads for this brand.")}`);
  }
  if (!Number.isFinite(leadCount) || leadCount < 0) {
    redirect(`/brand/${brandSlug}?error=${encodeURIComponent("Lead count must be 0 or more.")}`);
  }

  try {
    await upsertWeeklyLeads({
      brandId,
      weekStartDate,
      leadCount: Math.round(leadCount),
      enteredBy: user.id,
    });
  } catch (error) {
    redirect(
      `/brand/${brandSlug}?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save leads.")}`,
    );
  }

  redirect(`/brand/${brandSlug}?period=${encodeURIComponent(period)}&saved=${encodeURIComponent("Weekly leads saved")}`);
}
