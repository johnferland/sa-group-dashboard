"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { createBrand, updateBrand, type Brand } from "@/lib/brands";

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
