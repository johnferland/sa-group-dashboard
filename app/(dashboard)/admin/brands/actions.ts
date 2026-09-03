"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createBrand, updateBrand, type Brand } from "@/lib/brands";
import { formatBrandSyncSummary, syncGoogleMetricsForBrand } from "@/lib/integrations/sync-google";
import { rotateWebLeadsWebhookSecret } from "@/lib/web-leads";

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function inputFromForm(formData: FormData) {
  return {
    name: formValue(formData, "name"),
    slug: formValue(formData, "slug"),
    domain: formValue(formData, "domain"),
    accent_color: formValue(formData, "accent_color"),
    logo_url: formValue(formData, "logo_url"),
    ga4_property_id: formValue(formData, "ga4_property_id"),
    gsc_site_url: formValue(formData, "gsc_site_url"),
    google_ads_customer_id: formValue(formData, "google_ads_customer_id"),
    meta_ad_account_id: formValue(formData, "meta_ad_account_id"),
  };
}

function fail(message: string): never {
  redirect(`/admin?error=${encodeURIComponent(message)}`);
}

export async function createBrandAction(formData: FormData) {
  await requireSuperAdmin();
  let brand: Brand;
  try {
    brand = await createBrand(inputFromForm(formData));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not add brand.");
  }
    redirect(`/admin?saved=${encodeURIComponent(`Added ${brand.name}`)}`);
}

export async function updateBrandAction(formData: FormData) {
  await requireSuperAdmin();
  const brandId = formValue(formData, "brand_id");
  if (!brandId) fail("Missing brand id.");
  let brand: Brand;
  try {
    brand = await updateBrand(brandId, inputFromForm(formData));
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not save brand.");
  }
    redirect(`/admin?saved=${encodeURIComponent(`Saved ${brand.name}`)}`);
}

export async function syncBrandNowAction(formData: FormData) {
  await requireSuperAdmin();
  const brandId = formValue(formData, "brand_id");
  if (!brandId) fail("Missing brand id.");

  let message = "";
  let failed = false;
  try {
    const result = await syncGoogleMetricsForBrand(brandId, 14);
    failed =
      ("ok" in result.brand.ga4 && result.brand.ga4.ok === false) ||
      ("ok" in result.brand.gsc && result.brand.gsc.ok === false) ||
      ("ok" in result.brand.ads && result.brand.ads.ok === false) ||
      ("ok" in result.brand.meta && result.brand.meta.ok === false);
    message = formatBrandSyncSummary(result.brand);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Sync failed.");
  }

  if (failed) {
    redirect(`/admin?error=${encodeURIComponent(message)}`);
  }
  redirect(`/admin?saved=${encodeURIComponent(message)}`);
}

export async function rotateWebLeadsWebhookAction(formData: FormData) {
  await requireSuperAdmin();
  const brandId = formValue(formData, "brand_id");
  if (!brandId) fail("Missing brand id.");
  try {
    await rotateWebLeadsWebhookSecret(brandId);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Could not update webhook secret.");
  }
  redirect(`/admin?saved=${encodeURIComponent("Web leads webhook secret updated.")}`);
}
