import { redirect } from "next/navigation";
import { getCurrentAppUser, canAccessBrand, canLogWeeklyLeads } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBrandPeriodMetrics, listRecentLeads } from "@/lib/metrics";
import { currentWeekStart, getPeriodRange, isPeriodKey, type PeriodKey } from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import {
  Alert,
  Button,
  EmptyCard,
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
  const aiEntries = Object.entries(metrics.aiReferrals);

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

      <Section title="SEO">
        <div className="ds-grid">
          <MetricCard label="Clicks" metric={metrics.clicks} />
          <MetricCard label="Impressions" metric={metrics.impressions} />
          <MetricCard label="CTR" metric={metrics.ctr} digits={1} suffix="%" />
          <MetricCard label="Avg. position" metric={metrics.avgPosition} digits={1} />
        </div>
      </Section>

      <Section title="Ads">
        <div className="ds-grid">
          {metrics.googleSpend.current || metrics.metaSpend.current || metrics.adLeads.current ? (
            <>
              <MetricCard label="Google spend" metric={metrics.googleSpend} digits={0} prefix="$" />
              <MetricCard label="Meta spend" metric={metrics.metaSpend} digits={0} prefix="$" />
              <MetricCard label="Ad leads" metric={metrics.adLeads} />
            </>
          ) : (
            <EmptyCard label="Paid ads" note="No Google Ads / Meta IDs synced yet" />
          )}
        </div>
      </Section>

      <Section title="AI visibility">
        <div className="ds-grid">
          {aiEntries.length ? (
            aiEntries.map(([source, sessions]) => (
              <EmptyCard key={source} label={source} value={String(sessions)} note="AI referral sessions" />
            ))
          ) : (
            <EmptyCard
              label="AI referrals"
              note="No ChatGPT / Gemini / Claude / Perplexity / Copilot / Bing sessions in this period"
            />
          )}
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
