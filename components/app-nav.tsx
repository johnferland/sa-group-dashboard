"use client";

import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import type { AppUser } from "@/lib/auth";
import type { Brand } from "@/lib/brands";
import { Nav, NavBrand, NavLink, NavMenu, NavMenuItem, NavRight } from "@/components/ui";

export function AppNav({
  user,
  brands,
  labBrandSlug,
}: {
  user: AppUser;
  brands: Brand[];
  labBrandSlug?: string;
}) {
  const pathname = usePathname();
  const isLab = user.role === "lab_manager";
  const currentBrandSlug = pathname.startsWith("/brand/") ? pathname.split("/")[2] : undefined;
  const homeHref = isLab && labBrandSlug ? `/brand/${labBrandSlug}` : "/";
  const onAdmin = pathname.startsWith("/admin");
  const onRollup = pathname === "/";

  return (
    <Nav>
      <NavBrand href={homeHref}>SA Group</NavBrand>

      {!isLab ? (
        <>
          <NavLink href="/" active={onRollup}>
            Rollup
          </NavLink>
          <NavMenu label="Brands">
            {brands.map((brand) => (
              <NavMenuItem key={brand.id} href={`/brand/${brand.slug}`} active={brand.slug === currentBrandSlug}>
                {brand.name}
              </NavMenuItem>
            ))}
          </NavMenu>
        </>
      ) : null}

      {user.role === "super_admin" ? (
        <NavLink href="/admin" active={onAdmin}>
          Admin
        </NavLink>
      ) : null}

      <NavRight>
        <span>
          {user.email} · {user.role.replace("_", " ")}
        </span>
        <UserButton />
      </NavRight>
    </Nav>
  );
}
