import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

// TODO(Phase 2): super_admin UI for editing brand_credentials + triggering the Google OAuth
// consent flow (port google-setup/callback routes from the previous build).
export default async function CredentialsAdminPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "super_admin") redirect("/");

  return <main style={{ padding: "2rem" }}>Credentials admin — not built yet.</main>;
}
