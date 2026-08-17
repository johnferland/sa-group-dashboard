import { redirect } from "next/navigation";
import { getCurrentAppUser, canAccessBrand } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export default async function BrandDashboard({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

  const { brandSlug } = await params;
  const supabase = getSupabaseAdmin();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, accent_color, logo_url")
    .eq("slug", brandSlug)
    .maybeSingle();

  if (!brand) {
    return <main style={{ padding: "2rem" }}>Brand not found.</main>;
  }

  if (!canAccessBrand(user, brand.id as string)) {
    return <main style={{ padding: "2rem" }}>You don&apos;t have access to this brand.</main>;
  }

  // TODO(Phase 1): time-range picker, graph/number-card toggle, GA4/GSC/Ads sections.
  // TODO(Phase 2): AI-referral traffic section, weekly lead-count entry form (lab_manager).
  return (
    <main data-brand={brandSlug} style={{ padding: "2rem" }}>
      <h1>{brand.name as string}</h1>
      <p>Dashboard sections not built yet — this route just confirms brand-scoped access works.</p>
    </main>
  );
}
