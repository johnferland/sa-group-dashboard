import { getSupabaseAdmin } from "@/lib/supabase";
import { generateWebLeadsWebhookSecret } from "@/lib/web-leads";

export type Brand = {
  id: string;
  slug: string;
  name: string;
  domain: string;
  accent_color: string;
  logo_url: string | null;
  is_active?: boolean;
};

export type BrandCredentials = {
  ga4_property_id: string | null;
  gsc_site_url: string | null;
  google_ads_customer_id: string | null;
  meta_ad_account_id: string | null;
  web_leads_webhook_secret?: string | null;
};

export type BrandWithCredentials = Brand & BrandCredentials;

export type BrandInput = {
  name: string;
  slug?: string;
  domain: string;
  accent_color?: string;
  logo_url?: string | null;
} & BrandCredentials;

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Ads Manager shows digits; the Marketing API uses act_{id}. Store digits only. */
function normalizeMetaAdAccountId(value: string | null | undefined): string | null {
  const trimmed = emptyToNull(value);
  if (!trimmed) return null;
  const digits = trimmed.replace(/^act_/i, "").replace(/\D/g, "");
  return digits || null;
}

function normalizeBrandInput(input: BrandInput) {
  const name = input.name.trim();
  const domain = input.domain.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const slug = slugify(input.slug?.trim() || name);
  const accent_color = (input.accent_color?.trim() || "#0F62FE").toUpperCase();

  if (!name) throw new Error("Name is required.");
  if (!domain) throw new Error("Domain is required.");
  if (!slug) throw new Error("Could not build a slug from that name.");
  if (!/^#[0-9A-F]{6}$/.test(accent_color)) {
    throw new Error("Accent color must be a hex value like #0F62FE.");
  }

  return {
    name,
    slug,
    domain,
    accent_color,
    logo_url: emptyToNull(input.logo_url),
    ga4_property_id: emptyToNull(input.ga4_property_id),
    gsc_site_url: emptyToNull(input.gsc_site_url),
    google_ads_customer_id: emptyToNull(input.google_ads_customer_id),
    meta_ad_account_id: normalizeMetaAdAccountId(input.meta_ad_account_id),
  };
}

export async function listActiveBrands(): Promise<Brand[]> {
  const supabase = getSupabaseAdmin();
  const query = supabase.from("brands").select("id, slug, name, domain, accent_color, logo_url, is_active").order("name");
  const { data, error } = await query;
  if (error) {
    const fallback = await supabase.from("brands").select("id, slug, name, domain, accent_color, logo_url").order("name");
    if (fallback.error) throw new Error(fallback.error.message);
    return (fallback.data ?? []) as Brand[];
  }
  return ((data ?? []) as Brand[]).filter((brand) => brand.is_active !== false);
}

export async function getBrandById(brandId: string): Promise<Brand | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("brands")
    .select("id, slug, name, domain, accent_color, logo_url")
    .eq("id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Brand | null) ?? null;
}

export async function listBrandsWithCredentials(): Promise<BrandWithCredentials[]> {
  const supabase = getSupabaseAdmin();
  const { data: brands, error } = await supabase
    .from("brands")
    .select("id, slug, name, domain, accent_color, logo_url")
    .order("name");

  if (error) throw new Error(error.message);

  const { data: credentials, error: credError } = await supabase
    .from("brand_credentials")
    .select("brand_id, ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id, web_leads_webhook_secret");

  if (credError) throw new Error(credError.message);

  const byBrandId = new Map(
    (credentials ?? []).map((row) => [row.brand_id as string, row]),
  );

  return (brands ?? []).map((brand) => {
    const creds = byBrandId.get(brand.id as string);
    return {
      id: brand.id as string,
      slug: brand.slug as string,
      name: brand.name as string,
      domain: brand.domain as string,
      accent_color: brand.accent_color as string,
      logo_url: (brand.logo_url as string | null) ?? null,
      ga4_property_id: (creds?.ga4_property_id as string | null) ?? null,
      gsc_site_url: (creds?.gsc_site_url as string | null) ?? null,
      google_ads_customer_id: (creds?.google_ads_customer_id as string | null) ?? null,
      meta_ad_account_id: (creds?.meta_ad_account_id as string | null) ?? null,
      web_leads_webhook_secret: (creds?.web_leads_webhook_secret as string | null) ?? null,
    };
  });
}

async function upsertCredentials(brandId: string, input: ReturnType<typeof normalizeBrandInput>) {
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("brand_credentials")
    .select("web_leads_webhook_secret")
    .eq("brand_id", brandId)
    .maybeSingle();

  const { error } = await supabase.from("brand_credentials").upsert({
    brand_id: brandId,
    ga4_property_id: input.ga4_property_id,
    gsc_site_url: input.gsc_site_url,
    google_ads_customer_id: input.google_ads_customer_id,
    meta_ad_account_id: input.meta_ad_account_id,
    web_leads_webhook_secret:
      (existing?.web_leads_webhook_secret as string | null) ?? generateWebLeadsWebhookSecret(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function createBrand(input: BrandInput): Promise<Brand> {
  const normalized = normalizeBrandInput(input);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("brands")
    .insert({
      name: normalized.name,
      slug: normalized.slug,
      domain: normalized.domain,
      accent_color: normalized.accent_color,
      logo_url: normalized.logo_url,
    })
    .select("id, slug, name, domain, accent_color, logo_url")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`A brand with slug "${normalized.slug}" already exists.`);
    throw new Error(error.message);
  }

  await upsertCredentials(data.id as string, normalized);
  return data as Brand;
}

export async function updateBrand(brandId: string, input: BrandInput): Promise<Brand> {
  const normalized = normalizeBrandInput(input);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("brands")
    .update({
      name: normalized.name,
      slug: normalized.slug,
      domain: normalized.domain,
      accent_color: normalized.accent_color,
      logo_url: normalized.logo_url,
    })
    .eq("id", brandId)
    .select("id, slug, name, domain, accent_color, logo_url")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error(`A brand with slug "${normalized.slug}" already exists.`);
    throw new Error(error.message);
  }

  await upsertCredentials(brandId, normalized);
  return data as Brand;
}
