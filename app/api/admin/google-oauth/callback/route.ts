import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/admin/google-oauth/callback`;
}

export async function GET(request: Request) {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ ok: false, error: "Missing code" }, { status: 400 });
  }

  const oauth2Client = new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    getRedirectUri(),
  );

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    return NextResponse.json(
      { ok: false, error: "No refresh token returned — remove prior app access in Google Account settings and retry with prompt=consent." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("shared_credentials").upsert({
    provider: "google",
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
    updated_at: new Date().toISOString(),
  });

  return NextResponse.json({ ok: true, message: "Google credential saved." });
}
