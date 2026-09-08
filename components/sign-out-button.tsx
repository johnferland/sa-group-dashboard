"use client";

import { SignOutButton as ClerkSignOut } from "@clerk/nextjs";
import { Button } from "@/components/ui";

export function SignOutButton() {
  return (
    <ClerkSignOut redirectUrl="/sign-in">
      <Button type="button" variant="secondary">
        Sign out
      </Button>
    </ClerkSignOut>
  );
}
