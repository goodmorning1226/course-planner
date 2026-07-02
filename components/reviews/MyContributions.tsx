"use client";

import { useState } from "react";
import { MyReviews } from "@/components/reviews/MyReviews";
import { MyGradeReports } from "@/components/reviews/MyGradeReports";

// /my-reviews content: two tabs — the user's own 課程評價 and 成績分布.
// initialTab 由 /my-reviews 帶入，讓從修課情報返回時能回到原本的頁籤。
export function MyContributions({ initialTab = "reviews" }: { initialTab?: "reviews" | "grades" }) {
  const [tab, setTab] = useState<"reviews" | "grades">(initialTab);
  const tabs = [
    ["reviews", "課程評價"],
    ["grades", "成績分布"],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "rounded-md px-3 py-1.5 text-sm transition-colors " +
              (tab === k ? "bg-foreground text-background" : "bg-muted hover:opacity-80")
            }
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "reviews" ? <MyReviews /> : <MyGradeReports />}
    </div>
  );
}
