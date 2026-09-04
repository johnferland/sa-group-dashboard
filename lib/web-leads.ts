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
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  submittedAt?: string | null;
}) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("web_leads").insert({
    brand_id: input.brandId,
    count: input.count,
    source: input.source ?? null,
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
    email: input.email ?? null,
    submitted_at: input.submittedAt ?? null,
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

export type WebLeadRow = {
  id: string;
  received_at: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  submitted_at: string | null;
  count: number;
  source: string | null;
};

export const WEB_LEAD_PAGE_SIZES = [10, 25, 50] as const;
export type WebLeadPageSize = (typeof WEB_LEAD_PAGE_SIZES)[number];
const EXPORT_PAGE_SIZE = 1000;
const EXPORT_MAX_ROWS = 10_000;
const DETAIL_COLUMNS = "id, received_at, first_name, last_name, email, submitted_at, count, source";
const BASIC_COLUMNS = "id, received_at, count, source";

export function parseWebLeadPageSize(value: string | undefined): WebLeadPageSize {
  const parsed = Number(value);
  return WEB_LEAD_PAGE_SIZES.find((size) => size === parsed) ?? 10;
}

export function parseWebLeadPage(value: string | undefined): number {
  const parsed = Math.round(Number(value ?? 1));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function webLeadDate(row: WebLeadRow): string {
  return (row.submitted_at ?? row.received_at).slice(0, 10);
}

function isMissingRelation(message: string | undefined): boolean {
  return Boolean(message && /does not exist|schema cache/i.test(message));
}

function asWebLeadRow(row: Record<string, unknown>): WebLeadRow {
  return {
    id: String(row.id),
    received_at: String(row.received_at),
    first_name: row.first_name == null ? null : String(row.first_name),
    last_name: row.last_name == null ? null : String(row.last_name),
    email: row.email == null ? null : String(row.email),
    submitted_at: row.submitted_at == null ? null : String(row.submitted_at),
    count: Number(row.count ?? 1),
    source: row.source == null ? null : String(row.source),
  };
}

async function queryWebLeads(input: {
  brandId: string;
  start: string;
  end: string;
  rangeStart?: number;
  rangeEnd?: number;
}): Promise<{ rows: WebLeadRow[]; total: number }> {
  const supabase = getSupabaseAdmin();
  const run = async (columns: string) => {
    let query = supabase
      .from("web_leads")
      .select(columns, { count: "exact" })
      .eq("brand_id", input.brandId)
      .gte("received_at", `${input.start}T00:00:00.000Z`)
      .lte("received_at", `${input.end}T23:59:59.999Z`)
      .order("received_at", { ascending: false });
    if (input.rangeStart != null && input.rangeEnd != null) {
      query = query.range(input.rangeStart, input.rangeEnd);
    }
    return query;
  };

  let result = await run(DETAIL_COLUMNS);
  if (result.error && isMissingRelation(result.error.message)) {
    result = await run(BASIC_COLUMNS);
  }
  if (result.error) {
    if (isMissingRelation(result.error.message)) return { rows: [], total: 0 };
    throw new Error(result.error.message);
  }
  return {
    total: result.count ?? 0,
    rows: (result.data ?? []).map((row) => asWebLeadRow(row as unknown as Record<string, unknown>)),
  };
}

export async function listWebLeadsPage(input: {
  brandId: string;
  start: string;
  end: string;
  page: number;
  perPage: WebLeadPageSize;
}): Promise<{ rows: WebLeadRow[]; total: number; page: number }> {
  const requestedPage = Math.max(1, input.page);
  const rangeStart = (requestedPage - 1) * input.perPage;
  const first = await queryWebLeads({
    brandId: input.brandId,
    start: input.start,
    end: input.end,
    rangeStart,
    rangeEnd: rangeStart + input.perPage - 1,
  });
  const totalPages = Math.max(1, Math.ceil(first.total / input.perPage) || 1);
  const page = Math.min(requestedPage, totalPages);
  if (page === requestedPage || first.total === 0) {
    return { rows: first.rows, total: first.total, page };
  }
  const clampedStart = (page - 1) * input.perPage;
  const clamped = await queryWebLeads({
    brandId: input.brandId,
    start: input.start,
    end: input.end,
    rangeStart: clampedStart,
    rangeEnd: clampedStart + input.perPage - 1,
  });
  return { rows: clamped.rows, total: first.total, page };
}

export async function listWebLeadsInRange(input: {
  brandId: string;
  start: string;
  end: string;
}): Promise<WebLeadRow[]> {
  const rows: WebLeadRow[] = [];
  for (let offset = 0; offset < EXPORT_MAX_ROWS; offset += EXPORT_PAGE_SIZE) {
    const page = await queryWebLeads({
      brandId: input.brandId,
      start: input.start,
      end: input.end,
      rangeStart: offset,
      rangeEnd: offset + EXPORT_PAGE_SIZE - 1,
    });
    rows.push(...page.rows);
    if (page.rows.length < EXPORT_PAGE_SIZE || rows.length >= page.total) break;
  }
  return rows;
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
