"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const STAR_PATH =
  "M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z";

/** One star, `fill` = 0..1 portion filled (supports half via 0.5). */
function Star({ fill, size }: { fill: number; size: number }) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} className="text-muted-foreground/30" fill="currentColor">
        <path d={STAR_PATH} />
      </svg>
      <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: size * fill }}>
        <svg viewBox="0 0 24 24" width={size} height={size} className="text-amber-400" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      </span>
    </span>
  );
}

const fillFor = (value: number, i: number) => Math.min(1, Math.max(0, value - i));

/** Read-only star display (e.g. average rating). */
export function StarRating({
  value,
  size = 18,
  className,
}: {
  value: number;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex gap-0.5 align-middle", className)}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star key={i} fill={fillFor(value, i)} size={size} />
      ))}
    </span>
  );
}

/**
 * Interactive star input with half-star precision: clicking the LEFT half of a
 * star sets i+0.5, the RIGHT half sets i+1. Hover previews the value.
 */
export function StarRatingInput({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex gap-0.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className="relative" style={{ width: size, height: size }}>
            <Star fill={fillFor(shown, i)} size={size} />
            <button
              type="button"
              aria-label={`${i + 0.5} 星`}
              className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
              onMouseEnter={() => setHover(i + 0.5)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onChange(i + 0.5)}
            />
            <button
              type="button"
              aria-label={`${i + 1} 星`}
              className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
              onMouseEnter={() => setHover(i + 1)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onChange(i + 1)}
            />
          </span>
        ))}
      </span>
      {/* 即時顯示目前（或滑鼠預覽）的星等數字 */}
      <span className="min-w-[1.75rem] text-xs font-medium tabular-nums text-muted-foreground">
        {shown > 0 ? shown.toFixed(1) : ""}
      </span>
    </span>
  );
}
