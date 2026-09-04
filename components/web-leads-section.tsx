import {
  Button,
  Field,
  Input,
  Section,
  Table,
  TextMuted,
} from "@/components/ui";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import {
  WEB_LEAD_PAGE_SIZES,
  webLeadDate,
  type WebLeadPageSize,
  type WebLeadRow,
} from "@/lib/web-leads";
import type { PeriodKey } from "@/lib/period";

function pageHref(input: {
  brandSlug: string;
  period: PeriodKey;
  start: string;
  end: string;
  perPage: WebLeadPageSize;
  page: number;
}) {
  const params = new URLSearchParams({
    period: input.period,
    leads_from: input.start,
    leads_to: input.end,
    leads_per: String(input.perPage),
    leads_page: String(input.page),
  });
  return `/brand/${input.brandSlug}?${params}#web-leads`;
}

export function WebLeadsSection({
  brandSlug,
  period,
  start,
  end,
  perPage,
  page,
  rows,
  total,
}: {
  brandSlug: string;
  period: PeriodKey;
  start: string;
  end: string;
  perPage: WebLeadPageSize;
  page: number;
  rows: WebLeadRow[];
  total: number;
}) {
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  const totalPages = Math.max(1, Math.ceil(total / perPage) || 1);
  const exportUrl = `/api/brands/${brandSlug}/web-leads/export`;

  return (
    <Section title="Web leads">
      <div id="web-leads" className="ds-stack">
        <form method="get" action={`/brand/${brandSlug}#web-leads`} className="ds-stack">
          <input type="hidden" name="period" value={period} />
          <div className="ds-row">
            <Field label="From">
              <Input type="date" name="leads_from" defaultValue={start} required />
            </Field>
            <Field label="To">
              <Input type="date" name="leads_to" defaultValue={end} required />
            </Field>
            <Field label="Per page">
              <AutoSubmitSelect name="leads_per" defaultValue={String(perPage)}>
                {WEB_LEAD_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </AutoSubmitSelect>
            </Field>
          </div>
          <div className="ds-row">
            <Button>Apply</Button>
            <Button type="submit" variant="secondary" formAction={exportUrl} formMethod="get">
              Export CSV
            </Button>
          </div>
        </form>

        {total === 0 ? (
          <TextMuted>No web leads in this date range.</TextMuted>
        ) : (
          <>
            <Table headers={["Date", "First name", "Last name", "Email"]}>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{webLeadDate(row)}</td>
                  <td>{row.first_name ?? "—"}</td>
                  <td>{row.last_name ?? "—"}</td>
                  <td>{row.email ?? "—"}</td>
                </tr>
              ))}
            </Table>
            <div className="ds-row">
              <TextMuted>
                Showing {from}–{to} of {total}
              </TextMuted>
              {page > 1 ? (
                <Button
                  href={pageHref({ brandSlug, period, start, end, perPage, page: page - 1 })}
                  variant="secondary"
                >
                  Previous
                </Button>
              ) : null}
              {page < totalPages ? (
                <Button
                  href={pageHref({ brandSlug, period, start, end, perPage, page: page + 1 })}
                  variant="secondary"
                >
                  Next
                </Button>
              ) : null}
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
