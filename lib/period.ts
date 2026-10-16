import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns";
import type { DateRange } from "@/lib/aggregation";

export type PeriodKey = "week" | "month" | "quarter" | "year";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  week: "Week",
  month: "Month",
  quarter: "Quarter",
  year: "Year",
};

export const DEFAULT_PERIOD: PeriodKey = "month";

/** ISO yyyy-MM-dd → MM/dd/yy */
export function formatShortDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${month}/${day}/${year.slice(2)}`;
}

export function formatPeriodCaption(period: PeriodKey, range: DateRange): string {
  return `${PERIOD_LABELS[period]}: ${formatShortDate(range.start)} - ${formatShortDate(range.end)}`;
}

export function isPeriodKey(value: string | undefined): value is PeriodKey {
  return value === "week" || value === "month" || value === "quarter" || value === "year";
}

export function parsePeriodKey(value: string | undefined): PeriodKey {
  return isPeriodKey(value) ? value : DEFAULT_PERIOD;
}

/** Lab calendar date in America/New_York, not the Vercel UTC clock. */
function calendarToday(): Date {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoRange(start: Date, end: Date): DateRange {
  return { start: format(start, "yyyy-MM-dd"), end: format(end, "yyyy-MM-dd") };
}

export function getPeriodRange(period: PeriodKey = DEFAULT_PERIOD): DateRange {
  const today = calendarToday();
  if (period === "week") {
    const lastWeek = subWeeks(today, 1);
    return isoRange(startOfWeek(lastWeek, { weekStartsOn: 1 }), endOfWeek(lastWeek, { weekStartsOn: 1 }));
  }
  if (period === "month") {
    const month = subMonths(today, 1);
    return isoRange(startOfMonth(month), endOfMonth(month));
  }
  if (period === "quarter") {
    return isoRange(startOfMonth(subMonths(today, 3)), endOfMonth(subMonths(today, 1)));
  }
  const year = subYears(today, 1);
  return isoRange(startOfYear(year), endOfYear(year));
}

export function getPreviousPeriodRange(period: PeriodKey = DEFAULT_PERIOD): DateRange {
  const today = calendarToday();
  if (period === "week") {
    const twoWeeksAgo = subWeeks(today, 2);
    return isoRange(startOfWeek(twoWeeksAgo, { weekStartsOn: 1 }), endOfWeek(twoWeeksAgo, { weekStartsOn: 1 }));
  }
  if (period === "month") {
    const month = subMonths(today, 2);
    return isoRange(startOfMonth(month), endOfMonth(month));
  }
  if (period === "quarter") {
    return isoRange(startOfMonth(subMonths(today, 6)), endOfMonth(subMonths(today, 4)));
  }
  const year = subYears(today, 2);
  return isoRange(startOfYear(year), endOfYear(year));
}

export function currentWeekStart(): string {
  return format(startOfWeek(calendarToday(), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function utcTodayIso(): string {
  return format(calendarToday(), "yyyy-MM-dd");
}

export function easternDateFromTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

/** Monday snapshots (or today if a sync already ran). Week compares this snapshot to last Monday. */
export function getSnapshotAsOf(period: PeriodKey = DEFAULT_PERIOD, syncedToday = false): { current: string; previous: string } {
  const today = calendarToday();
  const thisMonday = startOfWeek(today, { weekStartsOn: 1 });
  const thisMondayIso = format(thisMonday, "yyyy-MM-dd");
  const todayIso = format(today, "yyyy-MM-dd");
  const current = syncedToday ? todayIso : thisMondayIso;

  if (period === "week") {
    const previous =
      syncedToday && todayIso > thisMondayIso
        ? thisMondayIso
        : format(subWeeks(thisMonday, 1), "yyyy-MM-dd");
    return { current, previous };
  }
  if (period === "month") {
    let previous = format(startOfWeek(endOfMonth(subMonths(today, 1)), { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (previous >= current) {
      previous = format(startOfWeek(endOfMonth(subMonths(today, 2)), { weekStartsOn: 1 }), "yyyy-MM-dd");
    }
    return { current, previous };
  }
  if (period === "quarter") {
    let previous = format(startOfWeek(endOfMonth(subMonths(today, 4)), { weekStartsOn: 1 }), "yyyy-MM-dd");
    if (previous >= current) {
      previous = format(startOfWeek(endOfMonth(subMonths(today, 7)), { weekStartsOn: 1 }), "yyyy-MM-dd");
    }
    return { current, previous };
  }
  let previous = format(startOfWeek(endOfYear(subYears(today, 1)), { weekStartsOn: 1 }), "yyyy-MM-dd");
  if (previous >= current) {
    previous = format(startOfWeek(endOfYear(subYears(today, 2)), { weekStartsOn: 1 }), "yyyy-MM-dd");
  }
  return { current, previous };
}

export function clampToToday(date: string): string {
  const today = utcTodayIso();
  return date > today ? today : date;
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
