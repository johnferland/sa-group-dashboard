import { formatDelta, formatNumber } from "@/lib/period";
import type { MetricValue } from "@/lib/metrics";
import { cn } from "@/lib/cn";
import { Card } from "./card";

export function MetricCard({
  label,
  metric,
  digits = 0,
  prefix = "",
  suffix = "",
}: {
  label: string;
  metric: MetricValue;
  digits?: number;
  prefix?: string;
  suffix?: string;
}) {
  const deltaClass =
    metric.delta == null
      ? "ds-delta"
      : metric.delta > 0
        ? "ds-delta ds-delta-up"
        : metric.delta < 0
          ? "ds-delta ds-delta-down"
          : "ds-delta";

  return (
    <Card>
      <p className="ds-metric-label">{label}</p>
      <p className="ds-metric-value">
        {prefix}
        {formatNumber(metric.current, digits)}
        {suffix}
      </p>
      <p className={deltaClass}>{formatDelta(metric.delta)} vs prior period</p>
    </Card>
  );
}

export function EmptyCard({ label, note, value = "—" }: { label: string; note: string; value?: string }) {
  return (
    <Card>
      <p className="ds-metric-label">{label}</p>
      <p className={cn("ds-metric-value", value === "—" && "ds-muted")}>{value}</p>
      <p className="ds-delta">{note}</p>
    </Card>
  );
}
