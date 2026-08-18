import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Page({
  children,
  brand,
  className,
}: {
  children: ReactNode;
  brand?: string;
  className?: string;
}) {
  return (
    <main className={cn("ds-page", className)} data-brand={brand}>
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="ds-page-header">
      <div>
        <h1 className="ds-heading">{title}</h1>
        {description ? <p className="ds-muted">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="ds-section">
      <h2 className="ds-heading-sm">{title}</h2>
      {children}
    </section>
  );
}

export function Alert({ tone, children }: { tone: "ok" | "err"; children: ReactNode }) {
  return <p className={tone === "ok" ? "ds-alert-ok" : "ds-alert-err"}>{children}</p>;
}

export function TextMuted({ children }: { children: ReactNode }) {
  return <p className="ds-muted">{children}</p>;
}
