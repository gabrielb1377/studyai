"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, CircleDot } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { AIManagerStatus } from "@/features/ai/AIProvider";
import { AISettings, aiProviderOptions, type AISettingsState } from "@/features/ai/AISettings";

export function AIStatusCard() {
  const [status, setStatus] = useState<AIManagerStatus | null>(null);
  const [settings, setSettings] = useState<AISettingsState>({
    version: 3,
    mode: "manual",
    provider: "gemini",
    models: {},
  });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/manager", { cache: "no-store" });
      if (!response.ok) return;
      setStatus(await response.json() as AIManagerStatus);
    } catch {
      setStatus(null);
    }
  }, []);

  useEffect(() => {
    setSettings(AISettings.load());
    void refresh();
    const handleSettings = () => {
      setSettings(AISettings.load());
      void refresh();
    };
    const interval = window.setInterval(() => void refresh(), 60_000);
    window.addEventListener("studyai:ai-settings-updated", handleSettings);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("studyai:ai-settings-updated", handleSettings);
    };
  }, [refresh]);
  const active = useMemo(() => {
    const providers = status?.providers ?? [];
    if (settings.mode === "manual") return providers.find((item) => item.provider === settings.provider);
    return [...providers]
      .filter((item) => item.available)
      .sort((left, right) => left.latencyMs - right.latencyMs)[0];
  }, [settings.mode, settings.provider, status]);
  const providerLabel = aiProviderOptions.find((item) => item.id === active?.provider)?.label ?? "Indisponível";
  const model = active
    ? settings.models[active.provider] ?? active.models[0]?.name ?? "—"
    : "—";

  return (
    <section aria-labelledby="ai-status-title">
      <Card className="h-full gap-4 p-5 shadow-none sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Bot className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="ai-status-title" className="font-semibold">IA</h2>
              <p className="text-sm text-muted-foreground">{settings.mode === "automatic" ? "Seleção automática" : "Seleção manual"}</p>
            </div>
          </div>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleDot className={active?.available ? "size-3 text-emerald-500" : "size-3"} />
            {active?.available ? "Online" : "Offline"}
          </span>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-muted-foreground">Provider atual</dt><dd className="mt-1 font-semibold">{providerLabel}</dd></div>
          <div><dt className="text-muted-foreground">Modelo</dt><dd className="mt-1 truncate font-semibold" title={model}>{model}</dd></div>
          <div><dt className="text-muted-foreground">Tempo médio</dt><dd className="mt-1 font-semibold">{status?.statistics.averageResponseTimeMs ?? 0} ms</dd></div>
          <div><dt className="text-muted-foreground">Mensagens</dt><dd className="mt-1 font-semibold">{status?.statistics.messages ?? 0}</dd></div>
          <div><dt className="text-muted-foreground">Tokens</dt><dd className="mt-1 font-semibold">{status?.statistics.tokens?.toLocaleString("pt-BR") ?? "—"}</dd></div>
        </dl>
      </Card>
    </section>
  );
}
