import { redirect } from "next/navigation";
import { getCurrentAppUser, canAccessBrand, canLogWeeklyLeads } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBrandPeriodMetrics, listRecentLeads } from "@/lib/metrics";
import { currentWeekStart, getPeriodRange, isPeriodKey, type PeriodKey } from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import {
  Alert,
  Button,
  Field,
  Input,
  MetricCard,
  Page,
  PageHeader,
  Panel,
  Section,
  Table,
  TextMuted,
} from "@/components/ui";
import { saveWeeklyLeadsAction } from "./actions";
import { AI_REFERRAL_PATTERNS } from "@/lib/integrations/ga4";

export default async function BrandDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ period?: string; saved?: string; error?: string }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

  const { brandSlug } = await params;
  const { period: periodParam, saved, error } = await searchParams;
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : "week";
  const range = getPeriodRange(period);

  const supabase = getSupabaseAdmin();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, name, slug, domain")
    .eq("slug", brandSlug)
    .maybeSingle();

  if (!brand) {
    return (
      <Page>
        <PageHeader title="Brand not found" />
      </Page>
    );
  }

  if (!canAccessBrand(user, brand.id as string)) {
    return (
      <Page>
        <PageHeader title="No access" description="You don't have access to this brand." />
      </Page>
    );
  }

  const [metrics, recentLeads] = await Promise.all([
    getBrandPeriodMetrics(brand.id as string, range),
    listRecentLeads(brand.id as string),
  ]);
  const canEnterLeads = canLogWeeklyLeads(user, brand.id as string);

  return (
    <Page brand={brandSlug}>
      <PageHeader
        title={brand.name as string}
        description={`${brand.domain as string} · ${range.start} to ${range.end}`}
        actions={<PeriodToggle current={period} basePath={`/brand/${brandSlug}`} />}
      />

      {saved ? <Alert tone="ok">{saved}</Alert> : null}
      {error ? <Alert tone="err">{error}</Alert> : null}

      <Section title="Website">
        <div className="ds-grid">
          <MetricCard label="Sessions" metric={metrics.sessions} />
          <MetricCard label="Conversions" metric={metrics.conversions} />
        </div>
      </Section>

      <Section title="Search">
        <div className="ds-grid">
          <MetricCard label="Keywords top 3" metric={metrics.keywordsTop3} />
          <MetricCard label="Organic reach" metric={metrics.organicReach} />
          <MetricCard label="Organic traffic" metric={metrics.organicTraffic} />
          <MetricCard label="New users" metric={metrics.newUsers} />
          <MetricCard label="Total keywords" metric={metrics.totalKeywords} />
          <MetricCard label="Clicks" metric={metrics.clicks} />
          <MetricCard label="Impressions" metric={metrics.impressions} />
          <MetricCard label="CTR" metric={metrics.ctr} digits={1} suffix="%" />
          <MetricCard label="Avg. position" metric={metrics.avgPosition} digits={1} />
        </div>
      </Section>

      <Section title="Google Ads">
        <div className="ds-grid">
          <MetricCard label="Ad spend" metric={metrics.googleSpend} digits={2} prefix="$" />
          <MetricCard label="Impressions" metric={metrics.googleImpressions} />
          <MetricCard label="Clicks" metric={metrics.googleClicks} />
          <MetricCard label="Conversions" metric={metrics.googleConversions} />
          <MetricCard label="Cost per conversion" metric={metrics.googleCostPerConversion} digits={2} prefix="$" />
        </div>
      </Section>

      <Section title="Meta Ads">
        <div className="ds-grid">
          <MetricCard label="Ad spend" metric={metrics.metaSpend} digits={2} prefix="$" />
          <MetricCard label="Impressions" metric={metrics.metaImpressions} />
          <MetricCard label="Clicks" metric={metrics.metaClicks} />
          <MetricCard label="Leads" metric={metrics.metaLeads} />
          <MetricCard label="CTR" metric={metrics.metaCtr} digits={2} suffix="%" />
          <MetricCard label="Cost per lead" metric={metrics.metaCostPerLead} digits={2} prefix="$" />
        </div>
      </Section>

      <Section title="AI visibility">
        <div className="ds-grid">
          <MetricCard label="Total AI referral traffic" metric={metrics.aiTotal} />
          {AI_REFERRAL_PATTERNS.map((pattern) => (
            <MetricCard key={pattern.key} label={pattern.label} metric={metrics.aiReferrals[pattern.key]} />
          ))}
        </div>
      </Section>

      <Section title="Leads">
        <div className="ds-grid">
          <MetricCard label="Weekly leads logged" metric={metrics.weeklyLeads} />
        </div>

        {canEnterLeads ? (
          <Panel className="ds-stack" style={{ marginTop: "var(--space-4)" }}>
            <h3 className="ds-heading-sm">Log this week&apos;s lead count</h3>
            <form action={saveWeeklyLeadsAction} className="ds-row">
              <input type="hidden" name="brand_id" value={brand.id as string} />
              <input type="hidden" name="brand_slug" value={brandSlug} />
              <input type="hidden" name="period" value={period} />
              <Field label="Week starting">
                <Input type="date" name="week_start_date" defaultValue={currentWeekStart()} required />
              </Field>
              <Field label="Total leads">
                <Input type="number" name="lead_count" min={0} step={1} required defaultValue={0} />
              </Field>
              <Button>Save leads</Button>
            </form>
          </Panel>
        ) : (
          <TextMuted>Lead entry is limited to Super Admins and this lab&apos;s manager.</TextMuted>
        )}

        {recentLeads.length ? (
          <Table headers={["Week starting", "Leads"]}>
            {recentLeads.map((row) => (
              <tr key={row.id as string}>
                <td>{row.week_start_date as string}</td>
                <td>{row.lead_count as number}</td>
              </tr>
            ))}
          </Table>
        ) : null}
      </Section>
    </Page>
  );
}
