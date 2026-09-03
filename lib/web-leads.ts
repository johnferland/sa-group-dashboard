import { timingSafeEqual, randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

export function generateWebLeadsWebhookSecret(): string {
  return `wl_${randomBytes(24).toString("hex")}`;
}

export function webhookSecretsMatch(provided: string, stored: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(stored);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function recordWebLeads(input: {
  brandId: string;
  count: number;
  source?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("web_leads").insert({
    brand_id: input.brandId,
    count: input.count,
    source: input.source ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function sumWebLeads(brandId: string, start: string, end: string): Promise<number> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("web_leads")
    .select("count, received_at")
    .eq("brand_id", brandId)
    .gte("received_at", `${start}T00:00:00.000Z`)
    .lte("received_at", `${end}T23:59:59.999Z`);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return (data ?? []).reduce((total, row) => total + Number(row.count ?? 0), 0);
}

export async function ensureWebLeadsWebhookSecret(brandId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("brand_credentials")
    .select("web_leads_webhook_secret")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const existing = (data?.web_leads_webhook_secret as string | null) ?? null;
  if (existing) return existing;

  const secret = generateWebLeadsWebhookSecret();
  const { error: upsertError } = await supabase.from("brand_credentials").upsert({
    brand_id: brandId,
    web_leads_webhook_secret: secret,
    updated_at: new Date().toISOString(),
  });
  if (upsertError) throw new Error(upsertError.message);
  return secret;
}

export async function rotateWebLeadsWebhookSecret(brandId: string): Promise<string> {
  const supabase = getSupabaseAdmin();
  const secret = generateWebLeadsWebhookSecret();
  const { error } = await supabase.from("brand_credentials").upsert({
    brand_id: brandId,
    web_leads_webhook_secret: secret,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return secret;
}
