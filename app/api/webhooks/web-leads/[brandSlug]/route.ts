import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordWebLeads, webhookSecretsMatch } from "@/lib/web-leads";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type LeadPayload = Record<string, unknown>;

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

function asRecord(value: unknown): LeadPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as LeadPayload;
  return {};
}

function pick(body: LeadPayload, keys: string[]): string | null {
  for (const key of keys) {
    const direct = body[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const lower = Object.entries(body).find(([name]) => name.toLowerCase().replace(/[\s-]/g, "_") === key);
    if (lower?.[1] != null && String(lower[1]).trim()) return String(lower[1]).trim();
  }
  return null;
}

function parseSubmittedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

async function readBody(request: Request): Promise<LeadPayload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return asRecord(await request.json());
    } catch {
      return {};
    }
  }
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const body: LeadPayload = {};
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") body[key] = value;
    }
    return body;
  }
  return {};
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string }> },
) {
  const { brandSlug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, slug")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (brandError) {
    return NextResponse.json({ ok: false, error: brandError.message }, { status: 500, headers: cors });
  }
  if (!brand) {
    return NextResponse.json({ ok: false, error: "Brand not found." }, { status: 404, headers: cors });
  }

  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("web_leads_webhook_secret")
    .eq("brand_id", brand.id)
    .maybeSingle();
  if (credError) {
    return NextResponse.json({ ok: false, error: credError.message }, { status: 500, headers: cors });
  }

  const storedSecret = (creds?.web_leads_webhook_secret as string | null) ?? "";
  if (!storedSecret) {
    return NextResponse.json(
      { ok: false, error: "No webhook secret for this company. Generate one in Admin." },
      { status: 403, headers: cors },
    );
  }

  const body = await readBody(request);
  const provided =
    pick(body, ["secret", "x-webhook-secret", "x_webhook_secret"]) ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    "";
  if (!provided || !webhookSecretsMatch(provided, storedSecret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401, headers: cors });
  }

  const count = Math.round(Number(pick(body, ["count"]) ?? 1));
  if (!Number.isFinite(count) || count < 1) {
    return NextResponse.json({ ok: false, error: "count must be 1 or more." }, { status: 400, headers: cors });
  }

  try {
    await recordWebLeads({
      brandId: brand.id as string,
      count,
      source: pick(body, ["source"]),
      firstName: pick(body, ["first_name", "firstname", "first-name", "your-name", "your_name"]),
      lastName: pick(body, ["last_name", "lastname", "last-name"]),
      email: pick(body, ["email", "your-email", "your_email", "email_address"]),
      submittedAt: parseSubmittedAt(pick(body, ["date", "submitted_at", "submitted-at", "created_at"])),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not record web lead." },
      { status: 500, headers: cors },
    );
  }

  return NextResponse.json({ ok: true, recorded: count }, { headers: cors });
}
