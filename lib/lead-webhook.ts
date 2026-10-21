export type LeadPayload = Record<string, unknown>;

export function asRecord(value: unknown): LeadPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as LeadPayload;
  return {};
}

export function pickLeadField(body: LeadPayload, keys: string[]): string | null {
  for (const key of keys) {
    const direct = body[key];
    if (direct != null && String(direct).trim()) return String(direct).trim();
    const lower = Object.entries(body).find(([name]) => name.toLowerCase().replace(/[\s-]/g, "_") === key);
    if (lower?.[1] != null && String(lower[1]).trim()) return String(lower[1]).trim();
  }
  return null;
}

export function parseSubmittedAt(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function splitFullName(value: string | null): { first: string | null; last: string | null } {
  if (!value) return { first: null, last: null };
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

export async function readLeadWebhookBody(request: Request): Promise<LeadPayload> {
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
  try {
    return asRecord(JSON.parse(await request.text()));
  } catch {
    return {};
  }
}

export function providedWebhookSecret(request: Request, body: LeadPayload): string {
  return (
    pickLeadField(body, ["secret", "x-webhook-secret", "x_webhook_secret"]) ??
    request.headers.get("x-webhook-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    new URL(request.url).searchParams.get("secret") ??
    ""
  );
}

export function isFacebookLeadgenPayload(body: LeadPayload): boolean {
  return body.object === "page" && Array.isArray(body.entry);
}

export function fieldDataToPayload(
  fields: Array<{ name?: string; values?: unknown[] }>,
  extra?: LeadPayload,
): LeadPayload {
  const payload: LeadPayload = { ...extra };
  for (const field of fields) {
    const name = field.name?.trim();
    const raw = field.values?.[0];
    if (name && raw != null && String(raw).trim()) payload[name] = String(raw).trim();
  }
  return payload;
}

export type ParsedLeadInsert = {
  source: string | null;
  attribution: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  submittedAt: string | null;
};

export function parseLeadInsert(
  body: LeadPayload,
  defaults?: { source?: string | null; attribution?: string | null },
): ParsedLeadInsert {
  const full = splitFullName(pickLeadField(body, ["full_name", "fullname", "name"]));
  return {
    source: pickLeadField(body, ["source"]) ?? defaults?.source ?? null,
    attribution:
      pickLeadField(body, ["attribution", "utm_source", "lead_source", "source"]) ??
      defaults?.attribution ??
      null,
    firstName:
      pickLeadField(body, ["first_name", "firstname", "first-name", "your-name", "your_name"]) ?? full.first,
    lastName: pickLeadField(body, ["last_name", "lastname", "last-name"]) ?? full.last,
    email: pickLeadField(body, ["email", "your-email", "your_email", "email_address"]),
    submittedAt: parseSubmittedAt(
      pickLeadField(body, ["date", "submitted_at", "submitted-at", "created_at", "created_time"]),
    ),
  };
}
