import { endOfYesterday, format, startOfWeek, subDays } from "date-fns";
import type { DateRange } from "@/lib/aggregation";

export type PeriodKey = "week" | "month" | "quarter";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
};

export function isPeriodKey(value: string | undefined): value is PeriodKey {
  return value === "week" || value === "month" || value === "quarter";
}

export function getPeriodRange(period: PeriodKey = "week"): DateRange {
  const end = endOfYesterday();
  const length = period === "week" ? 6 : period === "month" ? 29 : 89;
  const start = subDays(end, length);
  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}

export function currentWeekStart(): string {
  return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function utcTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)));
}

export function orderedDateRange(start: string, end: string): { start: string; end: string } {
  return start <= end ? { start, end } : { start: end, end: start };
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

export function formatDelta(value: number | null): string {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded}%`;
}
