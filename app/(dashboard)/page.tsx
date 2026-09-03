import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { getBrandById, listActiveBrands } from "@/lib/brands";
import { getBrandPeriodMetrics } from "@/lib/metrics";
import { getPeriodRange, isPeriodKey, type PeriodKey } from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import { Card, MetricCard, Page, PageHeader, TextMuted } from "@/components/ui";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

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
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : "week";
  const range = getPeriodRange(period);
  const brands = await listActiveBrands();
  const cards = await Promise.all(
    brands.map(async (brand) => ({
      brand,
      metrics: await getBrandPeriodMetrics(brand.id, range),
    })),
  );

  return (
    <Page>
      <PageHeader
        title="Executive rollup"
        description={`${range.start} to ${range.end}. Open a brand for the full dashboard.`}
        actions={<PeriodToggle current={period} basePath="/" />}
      />

      <div className="ds-grid-brands">
        {cards.map(({ brand, metrics }) => (
          <Card key={brand.id} href={`/brand/${brand.slug}?period=${period}`}>
            <h2 className="ds-heading-sm">{brand.name}</h2>
            <TextMuted>{brand.domain}</TextMuted>
            <div className="ds-grid" style={{ marginTop: "var(--space-3)" }}>
              <MetricCard label="Sessions" metric={metrics.sessions} />
              <MetricCard label="SEO clicks" metric={metrics.clicks} />
              <MetricCard label="Total leads" metric={metrics.totalLeads} />
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
