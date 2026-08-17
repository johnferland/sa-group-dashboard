// Period rollup helpers — ported pattern from the previous build's metrics-aggregation.ts.
// Given a metric series, compute a sum/weighted-average rollup for a date range, and the
// equal-length prior range for the always-on period-over-period comparison.

export type DateRange = { start: string; end: string }; // ISO yyyy-mm-dd

export function getPreviousPeriod(range: DateRange): DateRange {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const lengthMs = end.getTime() - start.getTime();
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);
  return {
    start: prevStart.toISOString().slice(0, 10),
    end: prevEnd.toISOString().slice(0, 10),
  };
}

export function sum(rows: number[]): number {
  return rows.reduce((total, value) => total + value, 0);
}

export function weightedAverage(values: number[], weights: number[]): number {
  const totalWeight = sum(weights);
  if (totalWeight === 0) return 0;
  const weightedSum = values.reduce((acc, value, i) => acc + value * weights[i], 0);
  return weightedSum / totalWeight;
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null; // avoid divide-by-zero noise
  return ((current - previous) / previous) * 100;
}
