import { Button, Table, TextMuted } from "@/components/ui";
import { formatShortDate, weekEndFromStart, type PeriodKey } from "@/lib/period";
import { offlineLeadTotal, type OfflineLeadRow } from "@/lib/metrics";

function weekHref(input: {
  brandSlug: string;
  period: PeriodKey;
  weekStart: string;
  extra?: Record<string, string>;
}) {
  const params = new URLSearchParams({
    period: input.period,
    ...input.extra,
    offline_week: input.weekStart,
  });
  return `/brand/${input.brandSlug}?${params}#offline-leads`;
}

export function OfflineLeadsTable({
  brandSlug,
  period,
  canEnter,
  rows,
  extraParams,
}: {
  brandSlug: string;
  period: PeriodKey;
  canEnter: boolean;
  rows: OfflineLeadRow[];
  extraParams?: Record<string, string>;
}) {
  if (rows.length === 0) {
    return <TextMuted>No offline weeks logged yet.</TextMuted>;
  }

  return (
    <Table
      headers={
        canEnter
          ? ["Week", "Phone", "Emails", "Referrals", "Trade shows", "Social media", "Offline total", "Edit"]
          : ["Week", "Phone", "Emails", "Referrals", "Trade shows", "Social media", "Offline total"]
      }
    >
      {rows.map((row) => (
        <tr key={row.id}>
          <td>
            {formatShortDate(row.week_start_date)} – {formatShortDate(weekEndFromStart(row.week_start_date))}
          </td>
          <td>{row.phone_leads}</td>
          <td>{row.email_leads}</td>
          <td>{row.referral_leads}</td>
          <td>{row.trade_show_leads}</td>
          <td>{row.social_media_leads}</td>
          <td>{offlineLeadTotal(row)}</td>
          {canEnter ? (
            <td>
              <Button
                href={weekHref({
                  brandSlug,
                  period,
                  weekStart: row.week_start_date,
                  extra: extraParams,
                })}
                variant="secondary"
              >
                Edit
              </Button>
            </td>
          ) : null}
        </tr>
      ))}
    </Table>
  );
}
