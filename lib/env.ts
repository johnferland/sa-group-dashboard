function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  // Supabase's new API key system: this is the sb_secret_... key (Settings -> API Keys ->
  // Secret keys), the direct successor to the old service_role key — full privileged access,
  // server-only, never exposed to the browser.
  supabaseSecretKey: () => required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY),
  googleClientId: () => required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: () => required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
  cronSecret: () => required("CRON_SECRET", process.env.CRON_SECRET),
};
