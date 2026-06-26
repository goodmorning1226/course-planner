import { cn } from "@/lib/utils";

// Small badge shown on a grid cell / list row when more than one course
// occupies the same (day, period) slot. Minimal: a single warning accent only.
export function ConflictBadge({
  count,
  showCount = true,
  className,
}: {
  count: number;
  showCount?: boolean;
  className?: string;
}) {
  if (count < 2) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-sm bg-[hsl(var(--warning))]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[hsl(var(--warning))]",
        className
      )}
      title={`此時段有 ${count} 門課衝堂`}
    >
      ⚠ 衝堂{showCount ? ` ×${count}` : ""}
    </span>
  );
}
