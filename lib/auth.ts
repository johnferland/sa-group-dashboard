import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export type Role = "super_admin" | "exec" | "lab_manager";

export type AppUser = {
  id: string;
  clerk_user_id: string | null;
  email: string;
  role: Role;
  brand_id: string | null;
};

function emailsFromClerkUser(clerk: {
  primaryEmailAddress?: { emailAddress?: string | null } | null;
  emailAddresses?: Array<{ emailAddress?: string | null }>;
} | null): string[] {
  if (!clerk) return [];
  const emails = new Set<string>();
  const primary = clerk.primaryEmailAddress?.emailAddress?.trim().toLowerCase();
  if (primary) emails.add(primary);
  for (const entry of clerk.emailAddresses ?? []) {
    const value = entry.emailAddress?.trim().toLowerCase();
    if (value) emails.add(value);
  }
  return [...emails];
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const supabase = getSupabaseAdmin();
  const byClerk = await supabase
    .from("users")
    .select("id, clerk_user_id, email, role, brand_id")
    .eq("clerk_user_id", userId)
    .maybeSingle<AppUser>();

  if (byClerk.data) return byClerk.data;

  const emails = emailsFromClerkUser(await currentUser());
  for (const email of emails) {
    const byEmail = await supabase
      .from("users")
      .select("id, clerk_user_id, email, role, brand_id")
      .ilike("email", email)
      .maybeSingle<AppUser>();

    if (!byEmail.data) continue;

    if (byEmail.data.clerk_user_id !== userId) {
      await supabase.from("users").update({ clerk_user_id: userId }).eq("id", byEmail.data.id);
    }
    return { ...byEmail.data, clerk_user_id: userId };
  }

  return null;
}

export async function requireAppUser(): Promise<AppUser> {
  const user = await getCurrentAppUser();
  if (user) return user;
  const { userId } = await auth();
  redirect(userId ? "/no-access" : "/sign-in");
}

export function canOpenAdmin(user: AppUser): boolean {
  return user.role === "super_admin";
}

export function canAccessBrand(user: AppUser, brandId: string): boolean {
  if (user.role === "super_admin" || user.role === "exec") return true;
  return user.brand_id === brandId;
}

export function canWrite(user: AppUser): boolean {
  return user.role === "super_admin";
}

export function canLogWeeklyLeads(user: AppUser, brandId: string): boolean {
  if (user.role === "super_admin") return true;
  return user.role === "lab_manager" && user.brand_id === brandId;
}

export async function requireSuperAdmin(): Promise<AppUser> {
  const user = await requireAppUser();
  if (user.role !== "super_admin") redirect("/");
  return user;
}
