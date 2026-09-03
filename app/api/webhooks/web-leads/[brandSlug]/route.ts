import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { recordWebLeads, webhookSecretsMatch } from "@/lib/web-leads";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
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

  const headerSecret =
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    "";

  let body: { count?: unknown; source?: unknown; secret?: unknown } = {};
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData();
    body = {
      count: form.get("count"),
      source: form.get("source"),
      secret: form.get("secret"),
    };
  }

  const provided = String(body.secret ?? headerSecret);
  if (!provided || !webhookSecretsMatch(provided, storedSecret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret." }, { status: 401, headers: cors });
  }

  const count = Math.round(Number(body.count ?? 1));
  if (!Number.isFinite(count) || count < 1) {
    return NextResponse.json({ ok: false, error: "count must be 1 or more." }, { status: 400, headers: cors });
  }

  try {
    await recordWebLeads({
      brandId: brand.id as string,
      count,
      source: body.source == null ? null : String(body.source),
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Could not record web lead." },
      { status: 500, headers: cors },
    );
  }

  return NextResponse.json({ ok: true, recorded: count }, { headers: cors });
}
