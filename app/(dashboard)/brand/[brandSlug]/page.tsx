import { redirect } from "next/navigation";
import { getCurrentAppUser, canAccessBrand, canLogWeeklyLeads } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBrandPeriodMetrics, listRecentLeads } from "@/lib/metrics";
import {
  listWebLeadsPage,
  parseWebLeadPage,
  parseWebLeadPageSize,
} from "@/lib/web-leads";
import {
  currentWeekStart,
  getPeriodRange,
  isIsoDate,
  isPeriodKey,
  orderedDateRange,
  utcTodayIso,
  type PeriodKey,
} from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import { WebLeadsSection } from "@/components/web-leads-section";
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

export const dynamic = "force-dynamic";

export default async function BrandDashboard({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{
    period?: string;
    saved?: string;
    error?: string;
    leads_from?: string;
    leads_to?: string;
    leads_page?: string;
    leads_per?: string;
  }>;
}) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/sign-in");

  const { brandSlug } = await params;
  const {
    period: periodParam,
    saved,
    error,
    leads_from: leadsFromParam,
    leads_to: leadsToParam,
    leads_page: leadsPageParam,
    leads_per: leadsPerParam,
  } = await searchParams;
  const period: PeriodKey = isPeriodKey(periodParam) ? periodParam : "week";
  const range = getPeriodRange(period);
  const leadsPer = parseWebLeadPageSize(leadsPerParam);
  const defaultLeadsRange = orderedDateRange(range.start, utcTodayIso());
  const leadsRange = orderedDateRange(
    isIsoDate(leadsFromParam) ? leadsFromParam : defaultLeadsRange.start,
    isIsoDate(leadsToParam) ? leadsToParam : defaultLeadsRange.end,
  );

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

  const [metrics, recentLeads, webLeads] = await Promise.all([
    getBrandPeriodMetrics(brand.id as string, range),
    listRecentLeads(brand.id as string),
    listWebLeadsPage({
      brandId: brand.id as string,
      start: leadsRange.start,
      end: leadsRange.end,
      page: parseWebLeadPage(leadsPageParam),
      perPage: leadsPer,
    }),
  ]);
  const canEnterLeads = canLogWeeklyLeads(user, brand.id as string);
  const weekStart = currentWeekStart();
  const thisWeek = recentLeads.find((row) => row.week_start_date === weekStart);

  return (
    <Page brand={brandSlug}>
      <PageHeader
        title={brand.name as string}
        description={`${brand.domain as string} · ${range.start} to ${range.end}`}
        actions={
          <PeriodToggle
            current={period}
            basePath={`/brand/${brandSlug}`}
            extraParams={
              leadsFromParam || leadsToParam || leadsPerParam
                ? {
                    leads_from: leadsRange.start,
                    leads_to: leadsRange.end,
                    leads_per: String(leadsPer),
                  }
                : undefined
            }
          />
        }
      />

      {saved ? <Alert tone="ok">{saved}</Alert> : null}
      {error ? <Alert tone="err">{error}</Alert> : null}

      <Section title="Leads">
        <div className="ds-grid">
          <MetricCard label="Total leads" metric={metrics.totalLeads} />
          <MetricCard label="Web leads" metric={metrics.webLeads} />
          <MetricCard label="Offline leads" metric={metrics.offlineLeads} />
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

      <Section title="Offline leads">
        {canEnterLeads ? (
          <Panel className="ds-stack">
            <h3 className="ds-heading-sm">Log this week&apos;s offline leads</h3>
            <form action={saveWeeklyLeadsAction} className="ds-stack">
              <input type="hidden" name="brand_id" value={brand.id as string} />
              <input type="hidden" name="brand_slug" value={brandSlug} />
              <input type="hidden" name="period" value={period} />
              <div className="ds-form-grid">
                <Field label="Week starting">
                  <Input type="date" name="week_start_date" defaultValue={weekStart} required />
                </Field>
                <Field label="Phone call leads">
                  <Input type="number" name="phone_leads" min={0} step={1} required defaultValue={thisWeek?.phone_leads ?? 0} />
                </Field>
                <Field label="Emails">
                  <Input type="number" name="email_leads" min={0} step={1} required defaultValue={thisWeek?.email_leads ?? 0} />
                </Field>
                <Field label="Referrals">
                  <Input type="number" name="referral_leads" min={0} step={1} required defaultValue={thisWeek?.referral_leads ?? 0} />
                </Field>
                <Field label="Trade shows">
                  <Input
                    type="number"
                    name="trade_show_leads"
                    min={0}
                    step={1}
                    required
                    defaultValue={thisWeek?.trade_show_leads ?? 0}
                  />
                </Field>
              </div>
              <p>
                <Button>Save leads</Button>
              </p>
            </form>
          </Panel>
        ) : (
          <TextMuted>Lead entry is limited to Super Admins and this lab&apos;s manager.</TextMuted>
        )}

        {recentLeads.length ? (
          <Table headers={["Week starting", "Phone", "Emails", "Referrals", "Trade shows", "Offline total"]}>
            {recentLeads.map((row) => {
              const total =
                row.phone_leads + row.email_leads + row.referral_leads + row.trade_show_leads || row.lead_count;
              return (
                <tr key={row.id}>
                  <td>{row.week_start_date}</td>
                  <td>{row.phone_leads}</td>
                  <td>{row.email_leads}</td>
                  <td>{row.referral_leads}</td>
                  <td>{row.trade_show_leads}</td>
                  <td>{total}</td>
                </tr>
              );
            })}
          </Table>
        ) : null}
      </Section>

      <WebLeadsSection
        brandSlug={brandSlug}
        period={period}
        start={leadsRange.start}
        end={leadsRange.end}
        perPage={leadsPer}
        page={webLeads.page}
        rows={webLeads.rows}
        total={webLeads.total}
      />
    </Page>
  );
}
