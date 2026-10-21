import { getSupabaseAdmin } from "@/lib/supabase";
import { generateMetaLeadsWebhookSecret, generateWebLeadsWebhookSecret } from "@/lib/web-leads";

export type Brand = {
  id: string;
  slug: string;
  name: string;
  nav_abbreviation: string | null;
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
  meta_leads_webhook_secret?: string | null;
};

export type BrandWithCredentials = Brand & BrandCredentials;

export type BrandInput = {
  name: string;
  slug?: string;
  nav_abbreviation?: string | null;
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

function missingColumn(message: string | undefined) {
  return Boolean(message && /does not exist|schema cache/i.test(message));
}

const BRAND_COLUMNS = "id, slug, name, nav_abbreviation, domain, accent_color, logo_url";
const BRAND_COLUMNS_BASIC = "id, slug, name, domain, accent_color, logo_url";

export function brandNavLabel(brand: Pick<Brand, "name" | "nav_abbreviation">): string {
  const abbreviation = brand.nav_abbreviation?.trim();
  return abbreviation || brand.name;
}

function mapBrand(row: Record<string, unknown>): Brand {
  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    nav_abbreviation: String(row.nav_abbreviation ?? "").trim() || null,
    domain: String(row.domain),
    accent_color: String(row.accent_color),
    logo_url: row.logo_url == null ? null : String(row.logo_url),
    is_active: row.is_active === undefined ? undefined : Boolean(row.is_active),
  };
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
  const accent_color = (input.accent_color?.trim() || "#22BC7E").toUpperCase();
  const nav_abbreviation = emptyToNull(input.nav_abbreviation);

  if (!name) throw new Error("Name is required.");
  if (!domain) throw new Error("Domain is required.");
  if (!slug) throw new Error("Could not build a slug from that name.");
  if (!/^#[0-9A-F]{6}$/.test(accent_color)) {
    throw new Error("Accent color must be a hex value like #22BC7E.");
  }

  return {
    name,
    slug,
    nav_abbreviation,
    domain,
    accent_color,
    logo_url: emptyToNull(input.logo_url),
    ga4_property_id: emptyToNull(input.ga4_property_id),
    gsc_site_url: emptyToNull(input.gsc_site_url),
    google_ads_customer_id: emptyToNull(input.google_ads_customer_id),
    meta_ad_account_id: normalizeMetaAdAccountId(input.meta_ad_account_id),
  };
}

async function queryBrandRows(columns: string) {
  const supabase = getSupabaseAdmin();
  return supabase.from("brands").select(columns).order("name");
}

async function listBrandRows(): Promise<Brand[]> {
  const attempts = [`${BRAND_COLUMNS}, is_active`, `${BRAND_COLUMNS_BASIC}, is_active`, BRAND_COLUMNS, BRAND_COLUMNS_BASIC];
  let lastError: string | undefined;
  for (const columns of attempts) {
    const { data, error } = await queryBrandRows(columns);
    if (!error) return (data ?? []).map((row) => mapBrand(row as unknown as Record<string, unknown>));
    lastError = error.message;
    if (!missingColumn(error.message)) throw new Error(error.message);
  }
  throw new Error(lastError ?? "Could not load brands.");
}

export async function listActiveBrands(): Promise<Brand[]> {
  return (await listBrandRows()).filter((brand) => brand.is_active !== false);
}

export async function getBrandById(brandId: string): Promise<Brand | null> {
  const supabase = getSupabaseAdmin();
  const full = await supabase.from("brands").select(BRAND_COLUMNS).eq("id", brandId).maybeSingle();
  if (!full.error) return full.data ? mapBrand(full.data as Record<string, unknown>) : null;
  if (!missingColumn(full.error.message)) throw new Error(full.error.message);
  const basic = await supabase.from("brands").select(BRAND_COLUMNS_BASIC).eq("id", brandId).maybeSingle();
  if (basic.error) throw new Error(basic.error.message);
  return basic.data ? mapBrand(basic.data as Record<string, unknown>) : null;
}

export async function listBrandsWithCredentials(): Promise<BrandWithCredentials[]> {
  const supabase = getSupabaseAdmin();
  const brands = await listBrandRows();
  const withMeta = await supabase
    .from("brand_credentials")
    .select(
      "brand_id, ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id, web_leads_webhook_secret, meta_leads_webhook_secret",
    );
  const credentialsQuery =
    withMeta.error && missingColumn(withMeta.error.message)
      ? await supabase
          .from("brand_credentials")
          .select(
            "brand_id, ga4_property_id, gsc_site_url, google_ads_customer_id, meta_ad_account_id, web_leads_webhook_secret",
          )
      : withMeta;

  if (credentialsQuery.error) throw new Error(credentialsQuery.error.message);

  const byBrandId = new Map(
    (credentialsQuery.data ?? []).map((row) => [row.brand_id as string, row as Record<string, unknown>]),
  );

  return brands.map((brand) => {
    const creds = byBrandId.get(brand.id);
    return {
      ...brand,
      ga4_property_id: (creds?.ga4_property_id as string | null) ?? null,
      gsc_site_url: (creds?.gsc_site_url as string | null) ?? null,
      google_ads_customer_id: (creds?.google_ads_customer_id as string | null) ?? null,
      meta_ad_account_id: (creds?.meta_ad_account_id as string | null) ?? null,
      web_leads_webhook_secret: (creds?.web_leads_webhook_secret as string | null) ?? null,
      meta_leads_webhook_secret: (creds?.meta_leads_webhook_secret as string | null) ?? null,
    };
  });
}

async function upsertCredentials(brandId: string, input: ReturnType<typeof normalizeBrandInput>) {
  const supabase = getSupabaseAdmin();
  const withMeta = await supabase
    .from("brand_credentials")
    .select("web_leads_webhook_secret, meta_leads_webhook_secret")
    .eq("brand_id", brandId)
    .maybeSingle();
  const existingQuery =
    withMeta.error && missingColumn(withMeta.error.message)
      ? await supabase
          .from("brand_credentials")
          .select("web_leads_webhook_secret")
          .eq("brand_id", brandId)
          .maybeSingle()
      : withMeta;
  const existing = (existingQuery.data ?? null) as Record<string, unknown> | null;

  const payload: Record<string, unknown> = {
    brand_id: brandId,
    ga4_property_id: input.ga4_property_id,
    gsc_site_url: input.gsc_site_url,
    google_ads_customer_id: input.google_ads_customer_id,
    meta_ad_account_id: input.meta_ad_account_id,
    web_leads_webhook_secret:
      (existing?.web_leads_webhook_secret as string | null) ?? generateWebLeadsWebhookSecret(),
    meta_leads_webhook_secret:
      (existing?.meta_leads_webhook_secret as string | null) ?? generateMetaLeadsWebhookSecret(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("brand_credentials").upsert(payload);
  if (error && missingColumn(error.message)) {
    const { meta_leads_webhook_secret: _meta, ...withoutMeta } = payload;
    const retry = await supabase.from("brand_credentials").upsert(withoutMeta);
    if (retry.error) throw new Error(retry.error.message);
    return;
  }
  if (error) throw new Error(error.message);
}

function brandWritePayload(normalized: ReturnType<typeof normalizeBrandInput>, includeAbbreviation: boolean) {
  return {
    name: normalized.name,
    slug: normalized.slug,
    domain: normalized.domain,
    accent_color: normalized.accent_color,
    logo_url: normalized.logo_url,
    ...(includeAbbreviation ? { nav_abbreviation: normalized.nav_abbreviation } : {}),
  };
}

export async function createBrand(input: BrandInput): Promise<Brand> {
  const normalized = normalizeBrandInput(input);
  const supabase = getSupabaseAdmin();

  const insert = await supabase
    .from("brands")
    .insert(brandWritePayload(normalized, true))
    .select(BRAND_COLUMNS)
    .single();
  const result =
    insert.error && missingColumn(insert.error.message)
      ? await supabase.from("brands").insert(brandWritePayload(normalized, false)).select(BRAND_COLUMNS_BASIC).single()
      : insert;

  if (result.error) {
    if (result.error.code === "23505") throw new Error(`A brand with slug "${normalized.slug}" already exists.`);
    throw new Error(result.error.message);
  }

  await upsertCredentials(result.data.id as string, normalized);
  return mapBrand(result.data as Record<string, unknown>);
}

export async function updateBrand(brandId: string, input: BrandInput): Promise<Brand> {
  const normalized = normalizeBrandInput(input);
  const supabase = getSupabaseAdmin();

  const update = await supabase
    .from("brands")
    .update(brandWritePayload(normalized, true))
    .eq("id", brandId)
    .select(BRAND_COLUMNS)
    .single();
  const result =
    update.error && missingColumn(update.error.message)
      ? await supabase
          .from("brands")
          .update(brandWritePayload(normalized, false))
          .eq("id", brandId)
          .select(BRAND_COLUMNS_BASIC)
          .single()
      : update;

  if (result.error) {
    if (result.error.code === "23505") throw new Error(`A brand with slug "${normalized.slug}" already exists.`);
    throw new Error(result.error.message);
  }

  await upsertCredentials(brandId, normalized);
  return mapBrand(result.data as Record<string, unknown>);
}
