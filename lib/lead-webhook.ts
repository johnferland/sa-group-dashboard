export type LeadPayload = Record<string, unknown>;

export function asRecord(value: unknown): LeadPayload {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as LeadPayload;
  return {};
}

function asRecordOrJson(value: unknown): LeadPayload {
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asRecord(value);
}

function leadScalar(value: unknown): string | null {
  if (value == null || typeof value === "object") return null;
  const text = String(value).trim();
  return text || null;
}

/** "Fields Your Name" / "Your Name" → your_name */
export function normalizeLeadKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^fields_/, "")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

export function flattenLeadPayload(body: LeadPayload): LeadPayload {
  const merged: LeadPayload = { ...body };
  for (const nested of [body.fields, body.Fields]) {
    const record = asRecordOrJson(nested);
    for (const [key, value] of Object.entries(record)) {
      if (merged[key] == null || merged[key] === "") merged[key] = value;
    }
  }
  return merged;
}

export function pickLeadField(body: LeadPayload, keys: string[]): string | null {
  const entries = Object.entries(flattenLeadPayload(body)).map(
    ([name, value]) => [normalizeLeadKey(name), value] as const,
  );
  for (const key of keys) {
    const want = normalizeLeadKey(key);
    const hit = entries.find(([name]) => name === want);
    const text = leadScalar(hit?.[1]);
    if (text) return text;
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

function nameFromObject(value: unknown): { first: string | null; last: string | null } | null {
  const record = asRecord(value);
  const first = leadScalar(record.first ?? record.first_name ?? record.First);
  const last = leadScalar(record.last ?? record.last_name ?? record.Last);
  if (!first && !last) return null;
  return { first, last };
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
  const payload = flattenLeadPayload(body);
  let named: { first: string | null; last: string | null } | null = null;
  for (const [key, value] of Object.entries(payload)) {
    const normalized = normalizeLeadKey(key);
    if (normalized !== "your_name" && normalized !== "full_name" && normalized !== "name") continue;
    named = nameFromObject(value);
    if (named) break;
  }
  const full = splitFullName(
    pickLeadField(payload, ["full_name", "fullname", "your_name", "your-name", "name"]),
  );
  return {
    source: pickLeadField(payload, ["source"]) ?? defaults?.source ?? null,
    attribution:
      pickLeadField(payload, ["attribution", "utm_source", "lead_source", "source"]) ??
      defaults?.attribution ??
      null,
    firstName:
      pickLeadField(payload, ["first_name", "firstname", "first-name"]) ?? named?.first ?? full.first,
    lastName: pickLeadField(payload, ["last_name", "lastname", "last-name"]) ?? named?.last ?? full.last,
    email: pickLeadField(payload, ["email", "your_email", "your-email", "email_address"]),
    submittedAt: parseSubmittedAt(
      pickLeadField(payload, ["date", "submitted_at", "submitted-at", "created_at", "created_time"]),
    ),
  };
}
