import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";

// TODO(Phase 2): closed-won deals + revenue + social outreach SQL entry (super_admin only,
// social SQLs restricted to ODL Ortho + SA Appliances at the form/route layer).
// The weekly lead-count form for lab_manager point people lives on the brand dashboard itself,
// not here — see app/(dashboard)/brand/[brandSlug]/page.tsx.
export default async function ManualEntryAdminPage() {
  const user = await getCurrentAppUser();
  if (!user || user.role !== "super_admin") redirect("/");

  return <main style={{ padding: "2rem" }}>Manual entry admin — not built yet.</main>;
}
