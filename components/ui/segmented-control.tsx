import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function SegmentedControl({ children }: { children: ReactNode }) {
  return <div className="ds-segmented">{children}</div>;
}

export function SegmentedItem({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={cn("ds-segmented-item", active && "ds-segmented-active")}>
      {children}
    </Link>
  );
}
