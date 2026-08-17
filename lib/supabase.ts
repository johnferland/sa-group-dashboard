import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Secret-key client only — every server-side data access goes through this. Do not expose the
// secret key to the client; there is no publishable-key client in this app by design (see the
// RLS note in supabase/schema.sql). Uses Supabase's new sb_secret_... key format — the
// createClient call itself doesn't care about the key format, so no code change was needed
// beyond swapping which env var it reads.
// No generated Database type yet (run `supabase gen types typescript` once the schema is
// deployed and swap this to createClient<Database>(...) for real row typing). Using `any`
// here deliberately so query results aren't inferred as `never` in the meantime.
let client: ReturnType<typeof createClient<any, "public", any>> | null = null;

export function getSupabaseAdmin() {
  if (!client) {
    client = createClient<any, "public", any>(env.supabaseUrl(), env.supabaseSecretKey(), {
      auth: { persistSession: false },
    });
  }
  return client;
}
