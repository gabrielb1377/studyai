"use client";

import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { AuthClient } from "@/features/account/AuthClient";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";

function send(name: string, value: number, unit: "ms" | "score" = "ms") {
  void fetch("/api/telemetry", {
    method: "POST",
    keepalive: true,
    headers: { "content-type": "application/json", "x-device-id": AuthClient.deviceId() },
    body: JSON.stringify({ name, value, unit }),
  }).catch(() => undefined);
}

export function ClientObservability() {
  const preferences = useExperiencePreferences();
  useReportWebVitals((metric) => {
    if (!preferences.telemetryConsent) return;
    send(metric.name, metric.value, metric.name === "CLS" ? "score" : "ms");
  });
  useEffect(() => {
    if (!preferences.telemetryConsent || !("PerformanceObserver" in window)) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (entry.duration >= 50) send("long-task", entry.duration);
    });
    try { observer.observe({ type: "longtask", buffered: true }); } catch { return; }
    return () => observer.disconnect();
  }, [preferences.telemetryConsent]);
  return null;
}
