import { PERIOD_LABELS, type PeriodKey } from "@/lib/period";
import { SegmentedControl, SegmentedItem } from "@/components/ui";

export function PeriodToggle({
  current,
  basePath,
  extraParams,
}: {
  current: PeriodKey;
  basePath: string;
  extraParams?: Record<string, string | undefined>;
}) {
  const path = basePath.split("?")[0];
  return (
    <SegmentedControl>
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => {
        const params = new URLSearchParams();
        for (const [name, value] of Object.entries(extraParams ?? {})) {
          if (value) params.set(name, value);
        }
        params.set("period", key);
        return (
          <SegmentedItem key={key} href={`${path}?${params}`} active={key === current}>
            {PERIOD_LABELS[key]}
          </SegmentedItem>
        );
      })}
    </SegmentedControl>
  );
}
