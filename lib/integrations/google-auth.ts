import { google } from "googleapis";
import { getSupabaseAdmin } from "@/lib/supabase";
import { env } from "@/lib/env";

function getRedirectUri() {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/admin/google-oauth/callback`;
}

export async function getGoogleAccessToken(): Promise<string> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("shared_credentials")
    .select("refresh_token")
    .eq("provider", "google")
    .maybeSingle();

  if (error) throw new Error(`Could not load Google credentials: ${error.message}`);

  const refreshToken = data?.refresh_token || process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("No Google refresh token. Use Connect Google as super admin first.");
  }

  const oauth2Client = new google.auth.OAuth2(
    env.googleClientId(),
    env.googleClientSecret(),
    getRedirectUri(),
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const token = await oauth2Client.getAccessToken();
  if (!token.token) throw new Error("Unable to retrieve Google access token.");
  return token.token;
}

export function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function formatGa4Date(value: string): string {
  if (/^\d{8}$/.test(value)) {
    return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  }
  return value;
}
