import { headers } from "next/headers";
import { Webhook } from "svix";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Provisions/reconciles `users` rows on Clerk sign-up. Ported pattern from the previous
// build's webhook route — a placeholder user row (keyed by invite metadata) should already
// exist with role/brand_id set at invite time; this just attaches the real clerk_user_id.
export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
  }

  const payload = await request.text();
  const headerList = await headers();
  const svixHeaders = {
    "svix-id": headerList.get("svix-id") ?? "",
    "svix-timestamp": headerList.get("svix-timestamp") ?? "",
    "svix-signature": headerList.get("svix-signature") ?? "",
  };

  let event: { type: string; data: Record<string, unknown> };
  try {
    event = new Webhook(secret).verify(payload, svixHeaders) as typeof event;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created") {
    const supabase = getSupabaseAdmin();
    const emails = [
      ...new Set(
        ((event.data.email_addresses as Array<{ email_address?: string }> | undefined) ?? [])
          .map((entry) => entry.email_address?.trim().toLowerCase())
          .filter((email): email is string => Boolean(email)),
      ),
    ];
    for (const email of emails) {
      await supabase.from("users").update({ clerk_user_id: event.data.id }).ilike("email", email);
    }
  }

  return NextResponse.json({ ok: true });
}
