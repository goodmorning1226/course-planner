"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// First-visit disclaimer. The exact copy below is mandated by the spec.
// We remember acknowledgement in localStorage so it only shows once.
const STORAGE_KEY = "course-planner-disclaimer-accepted";

export function DisclaimerDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Runs client-side only; show the dialog if not yet acknowledged.
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function acknowledge() {
    try {
      localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    } catch {
      /* ignore storage failures (e.g. private mode) */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="disclaimer-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
        <h2 id="disclaimer-title" className="text-lg font-semibold">
          使用前請先閱讀
        </h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            本網站為非官方臺大 115-1
            暫排課工具，並非臺大教務處或臺大課程網。
          </p>
          <p>
            本站資料由公開可查詢之臺大 115-1
            教室課表整理而來，僅供提前安排課程參考。
          </p>
          <p>目前資料可能不完整、不準確，且課程、教師、教室、時間皆可能異動。</p>
          <p>
            正式課程資訊、選課限制、名額、停開與異動，請以臺大課程網公告為準。
          </p>
          <p>請勿將本站資料視為正式選課依據。</p>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={acknowledge}>我了解，開始使用</Button>
        </div>
      </div>
    </div>
  );
}
