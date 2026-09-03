"use server";

import { redirect } from "next/navigation";
import { getCurrentAppUser, canLogWeeklyLeads } from "@/lib/auth";
import { upsertWeeklyLeads } from "@/lib/metrics";

function formNumber(formData: FormData, key: string): number {
  return Number(formData.get(key) ?? 0);
}

export async function saveWeeklyLeadsAction(formData: FormData) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

  const brandId = String(formData.get("brand_id") ?? "");
  const brandSlug = String(formData.get("brand_slug") ?? "");
  const weekStartDate = String(formData.get("week_start_date") ?? "");
  const phoneLeads = formNumber(formData, "phone_leads");
  const emailLeads = formNumber(formData, "email_leads");
  const referralLeads = formNumber(formData, "referral_leads");
  const tradeShowLeads = formNumber(formData, "trade_show_leads");
  const period = String(formData.get("period") ?? "week");
  const back = `/brand/${brandSlug}?period=${encodeURIComponent(period)}`;

  if (!brandId || !weekStartDate) {
    redirect(`${back}&error=${encodeURIComponent("Week start date is required.")}`);
  }
  if (!canLogWeeklyLeads(user, brandId)) {
    redirect(`${back}&error=${encodeURIComponent("You cannot enter leads for this brand.")}`);
  }
  const values = [phoneLeads, emailLeads, referralLeads, tradeShowLeads];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    redirect(`${back}&error=${encodeURIComponent("Each lead count must be 0 or more.")}`);
  }

  try {
    await upsertWeeklyLeads({
      brandId,
      weekStartDate,
      phoneLeads,
      emailLeads,
      referralLeads,
      tradeShowLeads,
      enteredBy: user.id,
    });
  } catch (error) {
    redirect(`${back}&error=${encodeURIComponent(error instanceof Error ? error.message : "Could not save leads.")}`);
  }

  redirect(`${back}&saved=${encodeURIComponent("Offline leads saved")}`);
}
