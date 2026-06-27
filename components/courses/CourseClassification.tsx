import type { CourseMetadata, CourseRequirement } from "@/lib/courses/types";
import { Badge } from "@/components/ui/card";
import {
  GE_AREA_LABELS,
  CATEGORY_LABEL,
  getRequirementDisplayName,
} from "@/lib/courses/classification";

// Compact classification display: 課程大類(可多個) + 通識領域 + 學分 + 必選修.
// Provenance wording is intentionally not shown here (global footer + disclaimer
// carry「正式資訊以臺大課程網為準」).
export function CourseClassification({
  metadata,
  requirements,
}: {
  metadata: CourseMetadata | null;
  requirements: CourseRequirement[];
}) {
  if (!metadata) {
    return <p className="text-[11px] text-muted-foreground">分類：尚未分類</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        {metadata.categories.map((c) => (
          <Badge key={c}>{CATEGORY_LABEL[c] ?? c}</Badge>
        ))}
        {metadata.is_general_education &&
          metadata.ge_categories.map((c) => (
            <Badge key={c}>{GE_AREA_LABELS[c] ? `${c} ${GE_AREA_LABELS[c]}` : c}</Badge>
          ))}
        {metadata.credits != null && (
          <span className="text-muted-foreground">{metadata.credits} 學分</span>
        )}
      </div>

      {requirements.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {requirements.slice(0, 6).map((r) => (
            <li key={r.id}>
              {r.target_department_name ?? "—"}｜
              {getRequirementDisplayName(r.requirement_normalized)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
