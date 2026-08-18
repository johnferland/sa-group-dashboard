import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Nav({ children }: { children: ReactNode }) {
  return <header className="ds-nav">{children}</header>;
}

export function NavBrand({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="ds-nav-brand">
      {children}
    </Link>
  );
}

export function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("ds-nav-link", active && "ds-nav-link-active")}>
      {children}
    </Link>
  );
}

export function NavMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <details className="ds-menu">
      <summary className="ds-menu-trigger">{label}</summary>
      <div className="ds-menu-list">{children}</div>
    </details>
  );
}

export function NavMenuItem({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("ds-menu-item", active && "ds-menu-item-active")}>
      {children}
    </Link>
  );
}

export function NavRight({ children }: { children: ReactNode }) {
  return <div className="ds-nav-right">{children}</div>;
}
