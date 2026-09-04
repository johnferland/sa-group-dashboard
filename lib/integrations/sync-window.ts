import { isoDateDaysAgo } from "@/lib/integrations/google-auth";

/** Year (365d) plus the prior year so period-over-period still has data. */
export const DASHBOARD_SYNC_DAYS = 730;
/** Weekly cron (Monday in vercel.json) refreshes the last 7 complete days. */
export const CRON_SYNC_DAYS = 7;

export function syncDateRange(days: number): { startDate: string; endDate: string } {
  return {
    startDate: isoDateDaysAgo(days),
    endDate: isoDateDaysAgo(1),
  };
}
