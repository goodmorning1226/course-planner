"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Disclaimer shown on every visit. The exact copy below is mandated by the spec.
// We remember acknowledgement in sessionStorage so it shows once per browser
// session (i.e. each time the user newly enters the site) rather than nagging on
// every internal navigation.
const STORAGE_KEY = "course-planner-disclaimer-accepted";

export function DisclaimerDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Runs client-side only; show the dialog if not yet acknowledged.
    try {
      if (!sessionStorage.getItem(STORAGE_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  function acknowledge() {
    try {
      sessionStorage.setItem(STORAGE_KEY, new Date().toISOString());
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
      // Outer layer scrolls so a tall dialog stays fully reachable on short
      // (mobile) viewports — the action button never ends up off-screen.
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-lg border border-border bg-background p-5 shadow-lg sm:p-6">
          <h2 id="disclaimer-title" className="text-center text-lg font-semibold">
            使用前請先閱讀
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            本網站為非官方的臺大 115-1
            排課工具，並非官方的臺大課程網！
          </p>
          <p>
            本站資料由公開的臺大 115-1
            教室課表爬取整理而來，僅供提前安排課程參考。課程、教師、教室、時間等資訊之後仍可能有異動。
          </p>
            <p>
              正式課程資訊、選課限制、名額、停開與異動等，請以臺大課程網之後公告為準。請勿將此網站作為正式選課依據。
            </p>
          </div>
          <div className="mt-6 flex justify-center">
            <Button onClick={acknowledge}>我了解，開始使用</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
