"use client";

import { useEffect } from "react";
import { getClientId } from "@/lib/client-id";

// Presence heartbeat: pings /api/heartbeat on load and every 45s while the tab
// is visible, so the admin dashboard can show active-now + active-over-time.
export function Heartbeat() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: getClientId() }),
        keepalive: true,
      }).catch(() => {});
    };
    ping();
    const iv = setInterval(ping, 45_000);
    document.addEventListener("visibilitychange", ping);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", ping);
    };
  }, []);
  return null;
}
