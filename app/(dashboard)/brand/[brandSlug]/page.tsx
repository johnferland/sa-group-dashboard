import { redirect } from "next/navigation";
import { requireAppUser, canAccessBrand, canLogWeeklyLeads } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getBrandPeriodMetrics, listRecentLeads } from "@/lib/metrics";
import {
  listWebLeadsPage,
  parseWebLeadPage,
  parseWebLeadPageSize,
} from "@/lib/web-leads";
import {
  clampToToday,
  currentWeekStart,
  formatPeriodCaption,
  formatShortDate,
  getPeriodRange,
  isIsoDate,
  orderedDateRange,
  parsePeriodKey,
  weekStartMonday,
} from "@/lib/period";
import { PeriodToggle } from "@/components/period-toggle";
import { WebLeadsSection } from "@/components/web-leads-section";
import { OfflineLeadsTable } from "@/components/offline-leads-section";
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
    offline_week?: string;
  }>;
}) {
  const user = await requireAppUser();

  const { brandSlug } = await params;
  const {
    period: periodParam,
    saved,
    error,
    leads_from: leadsFromParam,
    leads_to: leadsToParam,
    leads_page: leadsPageParam,
    leads_per: leadsPerParam,
    offline_week: offlineWeekParam,
  } = await searchParams;
  const period = parsePeriodKey(periodParam);
  const range = getPeriodRange(period);
  const periodLabel = formatPeriodCaption(period, range);
  const leadsPer = parseWebLeadPageSize(leadsPerParam);
  const defaultLeadsRange = orderedDateRange(range.start, clampToToday(range.end));
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
    getBrandPeriodMetrics(brand.id as string, range, period),
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
  const thisWeekStart = currentWeekStart();
  const formWeekStart = isIsoDate(offlineWeekParam) ? weekStartMonday(offlineWeekParam) : thisWeekStart;
  const formWeek = recentLeads.find((row) => row.week_start_date === formWeekStart);
  const leadsQuery =
    leadsFromParam || leadsToParam || leadsPerParam
      ? {
          leads_from: leadsRange.start,
          leads_to: leadsRange.end,
          leads_per: String(leadsPer),
        }
      : undefined;

  return (
    <Page brand={brandSlug}>
      <PageHeader
        title={brand.name as string}
        description={brand.domain as string}
        actions={
          <PeriodToggle
            current={period}
            basePath={`/brand/${brandSlug}`}
            extraParams={{
              ...leadsQuery,
              ...(isIsoDate(offlineWeekParam) ? { offline_week: formWeekStart } : {}),
            }}
          />
        }
      />

      {saved ? <Alert tone="ok">{saved}</Alert> : null}
      {error ? <Alert tone="err">{error}</Alert> : null}

      <Section title="Leads">
        <TextMuted>{periodLabel}</TextMuted>
        <div className="ds-grid">
          <MetricCard label="Total leads" hint="totalLeads" metric={metrics.totalLeads} />
          <MetricCard label="Web leads" hint="webLeads" metric={metrics.webLeads} />
          <MetricCard label="Offline leads" hint="offlineLeads" metric={metrics.offlineLeads} />
        </div>
      </Section>

      <Section title="Search">
        <TextMuted>{periodLabel}</TextMuted>
        <div className="ds-grid">
          <MetricCard label="Keywords top 3" hint="keywordsTop3" metric={metrics.keywordsTop3} />
          <MetricCard label="Organic reach" hint="organicReach" metric={metrics.organicReach} />
          <MetricCard label="Organic traffic" hint="organicTraffic" metric={metrics.organicTraffic} />
          <MetricCard label="New users" hint="newUsers" metric={metrics.newUsers} />
          <MetricCard label="Total keywords" hint="totalKeywords" metric={metrics.totalKeywords} />
          <MetricCard label="Clicks" hint="searchClicks" metric={metrics.clicks} />
          <MetricCard label="Impressions" hint="searchImpressions" metric={metrics.impressions} />
          <MetricCard label="CTR" hint="searchCtr" metric={metrics.ctr} digits={1} suffix="%" />
          <MetricCard label="Avg. position" hint="avgPosition" metric={metrics.avgPosition} digits={1} lowerIsBetter />
        </div>
      </Section>

      <Section title="Google Ads">
        <TextMuted>{periodLabel}</TextMuted>
        <div className="ds-grid">
          <MetricCard label="Ad spend" hint="googleSpend" metric={metrics.googleSpend} digits={2} prefix="$" lowerIsBetter />
          <MetricCard label="Impressions" hint="googleImpressions" metric={metrics.googleImpressions} />
          <MetricCard label="Clicks" hint="googleClicks" metric={metrics.googleClicks} />
          <MetricCard label="CPC" hint="googleCpc" metric={metrics.googleCpc} digits={2} prefix="$" lowerIsBetter />
          <MetricCard label="Conversions" hint="googleConversions" metric={metrics.googleConversions} />
          <MetricCard label="Cost per conversion" hint="googleCostPerConversion" metric={metrics.googleCostPerConversion} digits={2} prefix="$" lowerIsBetter />
        </div>
      </Section>

      <Section title="Meta Ads">
        <TextMuted>{periodLabel}</TextMuted>
        <div className="ds-grid">
          <MetricCard label="Ad spend" hint="metaSpend" metric={metrics.metaSpend} digits={2} prefix="$" lowerIsBetter />
          <MetricCard label="Impressions" hint="metaImpressions" metric={metrics.metaImpressions} />
          <MetricCard label="Clicks" hint="metaClicks" metric={metrics.metaClicks} />
          <MetricCard label="CPC" hint="metaCpc" metric={metrics.metaCpc} digits={2} prefix="$" lowerIsBetter />
          <MetricCard label="Leads" hint="metaLeads" metric={metrics.metaLeads} />
          <MetricCard label="CTR" hint="metaCtr" metric={metrics.metaCtr} digits={2} suffix="%" />
          <MetricCard label="Cost per lead" hint="metaCostPerLead" metric={metrics.metaCostPerLead} digits={2} prefix="$" lowerIsBetter />
        </div>
      </Section>

      <Section title="AI visibility">
        <TextMuted>{periodLabel}</TextMuted>
        <div className="ds-grid">
          <MetricCard label="Total AI referral traffic" hint="aiTotal" metric={metrics.aiTotal} />
          {AI_REFERRAL_PATTERNS.map((pattern) => (
            <MetricCard
              key={pattern.key}
              label={pattern.label}
              hint={pattern.key}
              metric={metrics.aiReferrals[pattern.key]}
            />
          ))}
        </div>
      </Section>

      <Section title="Offline leads">
        <div id="offline-leads" className="ds-stack">
          {canEnterLeads ? (
            <Panel className="ds-stack">
              <h3 className="ds-heading-sm">
                {formWeekStart === thisWeekStart
                  ? "Log this week's offline leads"
                  : `Edit week of ${formatShortDate(formWeekStart)}`}
              </h3>
              <TextMuted>
                Each row is a Monday–Sunday week. The Offline leads card above totals weeks that overlap{" "}
                {periodLabel}.
              </TextMuted>
              <form key={formWeekStart} action={saveWeeklyLeadsAction} className="ds-stack">
                <input type="hidden" name="brand_id" value={brand.id as string} />
                <input type="hidden" name="brand_slug" value={brandSlug} />
                <input type="hidden" name="period" value={period} />
                <div className="ds-form-grid">
                  <Field label="Week starting">
                    <Input type="date" name="week_start_date" defaultValue={formWeekStart} required />
                  </Field>
                  <Field label="Phone call leads">
                    <Input
                      type="number"
                      name="phone_leads"
                      min={0}
                      step={1}
                      required
                      defaultValue={formWeek?.phone_leads ?? 0}
                    />
                  </Field>
                  <Field label="Emails">
                    <Input
                      type="number"
                      name="email_leads"
                      min={0}
                      step={1}
                      required
                      defaultValue={formWeek?.email_leads ?? 0}
                    />
                  </Field>
                  <Field label="Referrals">
                    <Input
                      type="number"
                      name="referral_leads"
                      min={0}
                      step={1}
                      required
                      defaultValue={formWeek?.referral_leads ?? 0}
                    />
                  </Field>
                  <Field label="Trade shows">
                    <Input
                      type="number"
                      name="trade_show_leads"
                      min={0}
                      step={1}
                      required
                      defaultValue={formWeek?.trade_show_leads ?? 0}
                    />
                  </Field>
                  <Field label="Social media">
                    <Input
                      type="number"
                      name="social_media_leads"
                      min={0}
                      step={1}
                      required
                      defaultValue={formWeek?.social_media_leads ?? 0}
                    />
                  </Field>
                </div>
                <div className="ds-row">
                  <Button>{formWeek ? "Save week" : "Save leads"}</Button>
                  {formWeekStart !== thisWeekStart ? (
                    <Button
                      href={`/brand/${brandSlug}?${new URLSearchParams({
                        period,
                        ...(leadsQuery ?? {}),
                      })}#offline-leads`}
                      variant="secondary"
                    >
                      Log this week
                    </Button>
                  ) : null}
                </div>
              </form>
            </Panel>
          ) : (
            <TextMuted>Lead entry is limited to Super Admins and this lab&apos;s manager.</TextMuted>
          )}

          <OfflineLeadsTable
            brandSlug={brandSlug}
            period={period}
            canEnter={canEnterLeads}
            rows={recentLeads}
            extraParams={leadsQuery}
          />
        </div>
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
