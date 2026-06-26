import type { CourseMetadata, CourseRequirement } from "@/lib/courses/types";
import { Badge } from "@/components/ui/card";
import {
  GE_AREA_LABELS,
  getCourseTypeDisplayName,
  getRequirementDisplayName,
  getSourceDisplayName,
  getConfidenceDisplayName,
  isEstimatedSource,
} from "@/lib/courses/classification";

// Conservative display of a course's classification. Never asserts the data is
// official/complete; estimated sources are explicitly flagged. When there's no
// metadata, shows 尚未分類.
export function CourseClassification({
  metadata,
  requirements,
  compact = false,
}: {
  metadata: CourseMetadata | null;
  requirements: CourseRequirement[];
  compact?: boolean;
}) {
  if (!metadata) {
    return (
      <p className="text-[11px] text-muted-foreground">
        分類：尚未分類{compact ? "" : "（目前尚未取得此課程分類）"}
      </p>
    );
  }

  const estimated = isEstimatedSource(metadata.source);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <Badge>{getCourseTypeDisplayName(metadata.course_type_normalized)}</Badge>
        {metadata.is_general_education &&
          metadata.ge_categories.map((c) => (
            <Badge key={c}>
              {c} {GE_AREA_LABELS[c] ?? ""}
            </Badge>
          ))}
        {metadata.credits != null && (
          <span className="text-muted-foreground">{metadata.credits} 學分</span>
        )}
      </div>

      {requirements.length > 0 && (
        <ul className="text-xs text-muted-foreground">
          {requirements.map((r) => (
            <li key={r.id}>
              {r.target_department_name ?? "—"}｜
              {getRequirementDisplayName(r.requirement_normalized)}
            </li>
          ))}
        </ul>
      )}

      {/* Source + confidence, conservative wording. */}
      <p className="text-[11px] text-muted-foreground/80">
        {getSourceDisplayName(metadata.source)}
        {metadata.confidence !== "unknown" &&
          `（${getConfidenceDisplayName(metadata.confidence)}）`}
        {estimated && "：此分類依歷史 / 課號資料推估，正式資訊請以臺大課程網為準"}
      </p>
    </div>
  );
}
