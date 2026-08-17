// Gold/silver/bronze scoring across the five exec metrics. Equal-weighted by default per the
// project plan — flip WEIGHTS if SA Group wants a weighted scoring model instead.

export type BrandMetrics = {
  brandId: string;
  leadsGenerated: number;
  leadsClosed: number;
  organicTraffic: number;
  leadsPerDollar: number;
  revenue: number;
};

const WEIGHTS = {
  leadsGenerated: 1,
  leadsClosed: 1,
  organicTraffic: 1,
  leadsPerDollar: 1,
  revenue: 1,
};

function rankScore(values: number[]): number[] {
  // Simple ordinal scoring: highest value gets N points, lowest gets 1. Ties share the same score.
  const sorted = [...values].sort((a, b) => b - a);
  return values.map((v) => sorted.length - sorted.indexOf(v));
}

export function scoreLeaderboard(brands: BrandMetrics[]) {
  const fields = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
  const scoresByField = Object.fromEntries(
    fields.map((field) => [field, rankScore(brands.map((b) => b[field]))]),
  );

  const totals = brands.map((brand, i) => {
    const breakdown = Object.fromEntries(
      fields.map((field) => [field, scoresByField[field][i] * WEIGHTS[field]]),
    );
    const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { brandId: brand.brandId, total, breakdown };
  });

  return totals
    .sort((a, b) => b.total - a.total)
    .map((entry, i) => ({ ...entry, rank: i + 1 }));
}
