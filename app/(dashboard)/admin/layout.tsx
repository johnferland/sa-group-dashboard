import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/auth";

export const maxDuration = 300;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireSuperAdmin();
  return children;
}
