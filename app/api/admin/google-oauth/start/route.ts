import { google } from "googleapis";
import { NextResponse } from "next/server";
import { getCurrentAppUser } from "@/lib/auth";
import { env } from "@/lib/env";

// One-time consent flow, run once by whoever is logged into access@hueston.co in the browser.
// Ported from the previous build's google-setup route. Since GA4/GSC scopes are account-wide
// (not per-property), this single consent unlocks every brand's GA4 property + GSC site that
// access@hueston.co already has viewer access to — no per-brand OAuth needed.
const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/admin/google-oauth/callback`;
}

export async function GET() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "super_admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const oauth2Client = new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    getRedirectUri(),
  );

  const consentUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    response_type: "code",
    include_granted_scopes: true,
  });

  return NextResponse.redirect(consentUrl);
}
