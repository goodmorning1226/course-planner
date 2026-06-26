"use client";

import { useEffect } from "react";

// Fires one best-effort page-view beacon per load. No PII; just a counter.
export function PageViewTracker() {
  useEffect(() => {
    fetch("/api/track", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
