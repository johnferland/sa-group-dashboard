import { PERIOD_LABELS, type PeriodKey } from "@/lib/period";
import { SegmentedControl, SegmentedItem } from "@/components/ui";

export function PeriodToggle({
  current,
  basePath,
}: {
  current: PeriodKey;
  basePath: string;
}) {
  const joiner = basePath.includes("?") ? "&" : "?";
  return (
    <SegmentedControl>
      {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map((key) => (
        <SegmentedItem key={key} href={`${basePath}${joiner}period=${key}`} active={key === current}>
          {PERIOD_LABELS[key]}
        </SegmentedItem>
      ))}
    </SegmentedControl>
  );
}
