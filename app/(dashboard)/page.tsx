import { redirect } from "next/navigation";
import { requireAppUser } from "@/lib/auth";
import { getBrandById, listActiveBrands } from "@/lib/brands";
import { getBrandPeriodMetrics } from "@/lib/metrics";
import { formatPeriodCaption, getPeriodRange, parsePeriodKey } from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import { Card, MetricCard, Page, PageHeader, TextMuted } from "@/components/ui";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireAppUser();

  if (user.role === "lab_manager") {
    if (!user.brand_id) {
      return (
        <Page>
          <PageHeader title="No lab assigned" description="Ask a Super Admin to assign your email to a company." />
        </Page>
      );
    }
    const brand = await getBrandById(user.brand_id);
    redirect(brand ? `/brand/${brand.slug}` : "/sign-in");
  }

  const { period: periodParam } = await searchParams;
  const period = parsePeriodKey(periodParam);
  const range = getPeriodRange(period);
  const brands = await listActiveBrands();
  const cards = await Promise.all(
    brands.map(async (brand) => ({
      brand,
      metrics: await getBrandPeriodMetrics(brand.id, range, period),
    })),
  );

  return (
    <Page>
      <PageHeader
        title="Executive rollup"
        description={`${formatPeriodCaption(period, range)}. Open a brand for the full dashboard.`}
        actions={<PeriodToggle current={period} basePath="/" />}
      />

      <div className="ds-grid-brands">
        {cards.map(({ brand, metrics }) => (
          <Card key={brand.id} href={`/brand/${brand.slug}?period=${period}`} className="ds-card-frame">
            <div className="ds-stack">
              <div>
                <h2 className="ds-heading-sm">{brand.name}</h2>
                <TextMuted>{brand.domain}</TextMuted>
              </div>
              <MetricCard label="Total leads" hint="totalLeads" metric={metrics.totalLeads} />
              <MetricCard label="Organic traffic" hint="organicTraffic" metric={metrics.organicTraffic} />
              <MetricCard label="Top 3 keywords" hint="keywordsTop3" metric={metrics.keywordsTop3} />
              <MetricCard label="Cost per conversion" hint="adsCostPerConversion" metric={metrics.adsCostPerConversion} digits={2} prefix="$" lowerIsBetter />
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
