"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";

export type Point = { label: string; value: number };

// Minimal dependency-free SVG line chart for the admin dashboard.
export function LineChart({ title, data }: { title: string; data: Point[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 360, H = 140, padX = 8, padY = 14;
  const n = data.length;
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i: number) => padX + (n <= 1 ? (W - 2 * padX) / 2 : (i / (n - 1)) * (W - 2 * padX));
  const y = (v: number) => H - padY - (v / max) * (H - 2 * padY);
  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = n ? `${x(0)},${H - padY} ${line} ${x(n - 1)},${H - padY}` : "";
  const last = data[n - 1];
  const cur = hover != null ? data[hover] : last;

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">{title}</p>
        {cur && (
          <p className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{cur.value.toLocaleString()}</span>
            {" "}
            {cur.label}
          </p>
        )}
      </div>
      {n === 0 ? (
        <p className="py-8 text-center text-xs text-muted-foreground">尚無資料</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none"
          onMouseLeave={() => setHover(null)}>
          <polygon points={area} fill="hsl(var(--foreground))" opacity="0.06" />
          <polyline points={line} fill="none" stroke="hsl(var(--foreground))" strokeWidth="1.5"
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {data.map((d, i) => (
            <circle key={i} cx={x(i)} cy={y(d.value)} r={hover === i ? 3 : 0}
              fill="hsl(var(--foreground))" />
          ))}
          {/* invisible hover targets */}
          {data.map((d, i) => (
            <rect key={`h${i}`} x={x(i) - (W / Math.max(n, 1)) / 2} y={0}
              width={W / Math.max(n, 1)} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} />
          ))}
        </svg>
      )}
      {n > 0 && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{data[0].label}</span>
          {n > 1 && <span>{data[n - 1].label}</span>}
        </div>
      )}
    </Card>
  );
}
