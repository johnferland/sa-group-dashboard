import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  href,
  style,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
  style?: CSSProperties;
}) {
  const classes = cn("ds-card", href && "ds-card-link", className);
  if (href) {
    return (
      <Link href={href} className={classes} style={style}>
        {children}
      </Link>
    );
  }
  return (
    <section className={classes} style={style}>
      {children}
    </section>
  );
}

export function Panel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <section className={cn("ds-panel", className)} style={style}>
      {children}
    </section>
  );
}
