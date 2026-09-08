import type { ReactNode } from "react";
import { requireAppUser } from "@/lib/auth";
import { getBrandById, listActiveBrands } from "@/lib/brands";
import { AppNav } from "@/components/app-nav";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireAppUser();

  const brands = user.role === "lab_manager" ? [] : await listActiveBrands();
  const ownBrand = user.brand_id ? await getBrandById(user.brand_id) : null;

  return (
    <>
      <AppNav user={user} brands={brands} labBrandSlug={ownBrand?.slug} />
      {children}
    </>
  );
}
