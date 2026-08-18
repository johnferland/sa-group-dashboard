"use server";

import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { addOrAssignUser, assignExistingUser } from "@/lib/users";

function formValue(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "");
}

function parseRole(value: string): Role {
  if (value === "super_admin" || value === "exec" || value === "lab_manager") return value;
  throw new Error("Invalid role.");
}

export async function addPersonAction(formData: FormData) {
  await requireSuperAdmin();
  try {
    const role = parseRole(formValue(formData, "role"));
    await addOrAssignUser({
      email: formValue(formData, "email"),
      role,
      brandId: formValue(formData, "brand_id") || null,
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not add person.")}`);
  }
  redirect(`/admin?saved=${encodeURIComponent("Person saved. They can sign in with that email.")}`);
}

export async function assignPersonAction(formData: FormData) {
  await requireSuperAdmin();
  try {
    await assignExistingUser({
      userId: formValue(formData, "user_id"),
      role: parseRole(formValue(formData, "role")),
      brandId: formValue(formData, "brand_id") || null,
    });
  } catch (error) {
    redirect(`/admin?error=${encodeURIComponent(error instanceof Error ? error.message : "Could not assign person.")}`);
  }
  redirect(`/admin?saved=${encodeURIComponent("Assignment updated.")}`);
}
