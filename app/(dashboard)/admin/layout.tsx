import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin();
  return children;
}
