import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordWebLeads, webhookSecretsMatch } from "@/lib/web-leads";
import {
  asRecord,
  fieldDataToPayload,
  isFacebookLeadgenPayload,
  parseLeadInsert,
  pickLeadField,
  providedWebhookSecret,
  type LeadPayload,
} from "@/lib/lead-webhook";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret, X-Hub-Signature-256",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const META_DEFAULTS = { source: "meta", attribution: "Meta Ads" };

type BrandRow = { id: string; slug: string };

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string }> },
) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json({ ok: false, error: "Missing Facebook webhook verification params." }, { status: 400, headers: cors });
  }

  const loaded = await loadBrandSecret((await params).brandSlug);
  if (loaded.error) return loaded.error;
  if (!token || !webhookSecretsMatch(token, loaded.secret)) {
    return NextResponse.json({ ok: false, error: "Invalid verify token." }, { status: 403, headers: cors });
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { ...cors, "Content-Type": "text/plain" },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ brandSlug: string }> },
) {
  const loaded = await loadBrandSecret((await params).brandSlug);
  if (loaded.error) return loaded.error;

  const contentType = request.headers.get("content-type") ?? "";
  const signature = request.headers.get("x-hub-signature-256");
  let raw = "";
  let body: LeadPayload = {};

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    for (const [key, value] of form.entries()) {
      if (typeof value === "string") body[key] = value;
    }
  } else {
    raw = await request.text();
    try {
      body = asRecord(JSON.parse(raw || "{}"));
    } catch {
      body = {};
    }
  }

  const provided = providedWebhookSecret(request, body);
  const secretOk = Boolean(provided) && webhookSecretsMatch(provided, loaded.secret);
  const facebookOk = Boolean(signature) && facebookHubSignatureValid(raw, signature);

  if (!secretOk && !facebookOk) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401, headers: cors });
  }

  try {
    const recorded = isFacebookLeadgenPayload(body)
      ? await recordFacebookLeadgen(loaded.brand.id, body)
      : await recordMappedLead(loaded.brand.id, body);
    return NextResponse.json({ ok: true, recorded }, { headers: cors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not record Meta lead.";
    const status = message === "count must be 1 or more." ? 400 : 500;
    return NextResponse.json({ ok: false, error: message }, { status, headers: cors });
  }
}

async function loadBrandSecret(brandSlug: string): Promise<
  { brand: BrandRow; secret: string; error?: undefined } | { brand?: undefined; secret?: undefined; error: NextResponse }
> {
  const supabase = getSupabaseAdmin();
  const { data: brand, error: brandError } = await supabase
    .from("brands")
    .select("id, slug")
    .eq("slug", brandSlug)
    .maybeSingle();
  if (brandError) {
    return { error: NextResponse.json({ ok: false, error: brandError.message }, { status: 500, headers: cors }) };
  }
  if (!brand) {
    return { error: NextResponse.json({ ok: false, error: "Brand not found." }, { status: 404, headers: cors }) };
  }

  const { data: creds, error: credError } = await supabase
    .from("brand_credentials")
    .select("meta_leads_webhook_secret")
    .eq("brand_id", brand.id)
    .maybeSingle();
  if (credError) {
    const missing = /does not exist|schema cache/i.test(credError.message);
    return {
      error: NextResponse.json(
        {
          ok: false,
          error: missing
            ? "Run supabase/add-meta-leads-webhook-secret.sql in Supabase, then generate a Meta webhook secret in Admin."
            : credError.message,
        },
        { status: missing ? 403 : 500, headers: cors },
      ),
    };
  }

  const secret = (creds?.meta_leads_webhook_secret as string | null) ?? "";
  if (!secret) {
    return {
      error: NextResponse.json(
        { ok: false, error: "No Meta webhook secret for this company. Generate one in Admin." },
        { status: 403, headers: cors },
      ),
    };
  }

  return { brand: { id: brand.id as string, slug: brand.slug as string }, secret };
}

async function recordMappedLead(brandId: string, body: LeadPayload): Promise<number> {
  const count = Math.round(Number(pickLeadField(body, ["count"]) ?? 1));
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("count must be 1 or more.");
  }
  const lead = parseLeadInsert(body, META_DEFAULTS);
  await recordWebLeads({
    brandId,
    count,
    source: lead.source,
    attribution: lead.attribution,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    submittedAt: lead.submittedAt,
  });
  return count;
}

async function recordFacebookLeadgen(brandId: string, body: LeadPayload): Promise<number> {
  const entries = Array.isArray(body.entry) ? body.entry : [];
  let recorded = 0;
  for (const entry of entries) {
    const changes = asRecord(entry).changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const item = asRecord(change);
      if (item.field !== "leadgen") continue;
      const value = asRecord(item.value);
      const leadgenId = typeof value.leadgen_id === "string" ? value.leadgen_id : "";
      const createdTime =
        typeof value.created_time === "number"
          ? new Date(value.created_time * 1000).toISOString()
          : typeof value.created_time === "string"
            ? value.created_time
            : null;
      const inlineFields = Array.isArray(value.field_data)
        ? (value.field_data as Array<{ name?: string; values?: unknown[] }>)
        : [];
      const fetched = leadgenId ? await fetchFacebookLead(leadgenId) : {};
      const payload: LeadPayload = {
        ...fieldDataToPayload(inlineFields),
        ...fetched,
      };
      if (createdTime && !payload.created_time) payload.created_time = createdTime;
      recorded += await recordMappedLead(brandId, payload);
    }
  }
  return recorded;
}

async function fetchFacebookLead(leadgenId: string): Promise<LeadPayload> {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token) return {};
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v22.0";
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  const json = (await response.json()) as {
    created_time?: string;
    field_data?: Array<{ name?: string; values?: unknown[] }>;
    error?: { message?: string };
  };
  if (!response.ok) {
    console.error("[meta-leads] Graph lead fetch failed", leadgenId, json.error?.message ?? response.status);
    return {};
  }
  return fieldDataToPayload(json.field_data ?? [], { created_time: json.created_time });
}

function facebookHubSignatureValid(rawBody: string, header: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET?.trim();
  if (!appSecret || !header) return false;
  const digest = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expected = Buffer.from(`sha256=${digest}`);
  const provided = Buffer.from(header);
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
