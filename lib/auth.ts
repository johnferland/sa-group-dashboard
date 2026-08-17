import { auth } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Role = "super_admin" | "exec" | "lab_manager";

export type AppUser = {
  id: string;
  clerk_user_id: string;
  email: string;
  role: Role;
  brand_id: string | null;
};

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, clerk_user_id, email, role, brand_id")
    .eq("clerk_user_id", userId)
    .maybeSingle<AppUser>();

  if (error || !data) return null;
  return data;
}

/** Throws-free scoping check: does this user have (read) access to this brand? */
export function canAccessBrand(user: AppUser, brandId: string): boolean {
  if (user.role === "super_admin" || user.role === "exec") return true;
  return user.brand_id === brandId;
}

/** Only super_admin can write anything. */
export function canWrite(user: AppUser): boolean {
  return user.role === "super_admin";
}

/** The one write exception: a lab_manager may log their own brand's weekly lead count. */
export function canLogWeeklyLeads(user: AppUser, brandId: string): boolean {
  if (user.role === "super_admin") return true;
  return user.role === "lab_manager" && user.brand_id === brandId;
}
