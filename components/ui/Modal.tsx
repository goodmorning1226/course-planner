"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";

// Overlay modal — same pattern as DisclaimerDialog (fixed inset, z-50, click-out
// + Esc to close). Outer layer scrolls so tall content stays reachable on mobile.
export function Modal({
  open,
  onClose,
  title,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/50"
      onClick={onClose}
    >
      <div className="flex min-h-full items-start justify-center p-4 sm:items-center">
        <div
          className={cn(
            "my-6 w-full max-w-2xl rounded-lg border border-border bg-background p-5 shadow-lg sm:p-6",
            className
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title !== undefined && (
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="關閉"
                className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
