import { getSupabaseAdmin } from "@/lib/supabase";
import type { AppUser, Role } from "@/lib/auth";

export type ManagedUser = {
  id: string;
  email: string;
  role: Role;
  brand_id: string | null;
  clerk_user_id: string | null;
  brand_name: string | null;
};

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, role, brand_id, clerk_user_id, brands(name)")
    .order("email");
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands;
    return {
      id: row.id as string,
      email: row.email as string,
      role: row.role as Role,
      brand_id: (row.brand_id as string | null) ?? null,
      clerk_user_id: (row.clerk_user_id as string | null) ?? null,
      brand_name: (brand?.name as string | null) ?? null,
    };
  });
}

export async function addOrAssignUser(input: {
  email: string;
  role: Role;
  brandId: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("A valid email is required.");
  if (input.role === "lab_manager" && !input.brandId) {
    throw new Error("Lab managers must be assigned to a company.");
  }

  const brandId = input.role === "lab_manager" ? input.brandId : null;
  const supabase = getSupabaseAdmin();
  const { data: existing, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  if (existing) {
    const { error } = await supabase
      .from("users")
      .update({ role: input.role, brand_id: brandId })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase.from("users").insert({
    email,
    role: input.role,
    brand_id: brandId,
    clerk_user_id: `pending:${crypto.randomUUID()}`,
  });
  if (error) throw new Error(error.message);
}

export async function assignExistingUser(input: { userId: string; role: Role; brandId: string | null }) {
  if (input.role === "lab_manager" && !input.brandId) {
    throw new Error("Lab managers must be assigned to a company.");
  }
  const brandId = input.role === "lab_manager" ? input.brandId : null;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("users")
    .update({ role: input.role, brand_id: brandId })
    .eq("id", input.userId);
  if (error) throw new Error(error.message);
}

export function homePathForUser(user: AppUser, brandSlug?: string | null): string {
  if (user.role === "lab_manager") {
    return brandSlug ? `/brand/${brandSlug}` : "/";
  }
  return "/";
}
