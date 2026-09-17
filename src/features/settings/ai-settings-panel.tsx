"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  AIManagerStatus,
  AIModelPreferences,
  AIProviderId,
  AISelectionMode,
} from "@/features/ai/AIProvider";
import { AISettings, aiProviderOptions } from "@/features/ai/AISettings";

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function formatMemory(bytes?: number) {
  if (!bytes) return "—";
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function AISettingsPanel() {
  const [mode, setMode] = useState<AISelectionMode>("manual");
  const [provider, setProvider] = useState<AIProviderId>("gemini");
  const [models, setModels] = useState<AIModelPreferences>({});
  const [managerStatus, setManagerStatus] = useState<AIManagerStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [testingProvider, setTestingProvider] = useState<AIProviderId | null>(null);

  useEffect(() => {
    const settings = AISettings.load();
    setMode(settings.mode);
    setProvider(settings.provider);
    setModels(settings.models);
    setIsReady(true);
  }, []);

  const testProvider = async (providerId: AIProviderId) => {
    setTestingProvider(providerId);
    try {
      const response = await fetch(`/api/ai/providers/${providerId}?refresh=true`, { cache: "no-store" });
      const status = await response.json().catch(() => null) as AIManagerStatus["providers"][number] | null;
      if (status) {
        setManagerStatus((current) => current
          ? { ...current, providers: current.providers.map((item) => item.provider === providerId ? status : item) }
          : current);
      }
    } finally {
      setTestingProvider(null);
    }
  };

  const refreshStatus = useCallback(async (force = false) => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/ai/manager${force ? "?refresh=true" : ""}`, {
        cache: "no-store",
      });
      const data = await response.json().catch(() => null) as AIManagerStatus | null;
      if (!response.ok || !data) throw new Error("Não foi possível atualizar os providers.");
      setManagerStatus(data);
    } catch {
      setManagerStatus(null);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const interval = window.setInterval(() => void refreshStatus(), 60_000);
    return () => window.clearInterval(interval);
  }, [refreshStatus]);

  const activeStatus = useMemo(() => {
    const statuses = managerStatus?.providers ?? [];
    if (mode === "manual") return statuses.find((item) => item.provider === provider);
    return [...statuses]
      .filter((item) => item.available)
      .sort((left, right) => left.latencyMs - right.latencyMs)[0];
  }, [managerStatus, mode, provider]);

  const activeModel = activeStatus
    ? models[activeStatus.provider] ?? activeStatus.models[0]?.name ?? "—"
    : models[provider] ?? "—";

  return (
    <Card className="max-w-4xl shadow-none">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Gerenciador de IA</CardTitle>
            <CardDescription>Selecione manualmente ou deixe o StudyAI usar o provider online mais rápido.</CardDescription>
          </div>
          <Bot className="size-5 text-primary" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Modo de seleção</legend>
          <div className="inline-flex rounded-lg border bg-muted/30 p-1">
            {(["manual", "automatic"] as const).map((item) => (
              <Button
                key={item}
                type="button"
                size="sm"
                variant={mode === item ? "secondary" : "ghost"}
                aria-pressed={mode === item}
                disabled={!isReady}
                onClick={() => {
                  setMode(item);
                  AISettings.saveMode(item);
                }}
              >
                {item === "manual" ? "Manual" : "Automático"}
              </Button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {mode === "automatic"
              ? "O menor tempo de resposta entre os providers online define a primeira tentativa."
              : "O provider escolhido é usado primeiro; o fallback continua ativo em caso de falha."}
          </p>
        </fieldset>

        <label className="grid gap-2 text-sm font-medium sm:max-w-md">
          Provider preferencial
          <select
            aria-label="Provider de IA"
            value={provider}
            disabled={!isReady || mode === "automatic"}
            onChange={(event) => {
              const nextProvider = event.target.value as AIProviderId;
              setProvider(nextProvider);
              AISettings.save(nextProvider);
            }}
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aiProviderOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>

        {mode === "manual" && (
          <label className="grid gap-2 text-sm font-medium sm:max-w-md">
            Modelo do provider
            <select
              aria-label={provider === "ollama" ? "Modelo do Ollama" : `Modelo do ${provider}`}
              value={models[provider] ?? activeStatus?.models[0]?.name ?? ""}
              disabled={!activeStatus?.available || activeStatus.models.length === 0}
              onChange={(event) => {
                const nextModels = { ...models, [provider]: event.target.value };
                setModels(nextModels);
                AISettings.saveModel(provider, event.target.value);
              }}
              className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {activeStatus?.models.length ? activeStatus.models.map((item) => (
                <option key={item.name} value={item.name}>{item.name}</option>
              )) : <option value="">Nenhum modelo encontrado</option>}
            </select>
          </label>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div aria-live="polite" className="text-sm">
            Provider atual: <strong>{activeStatus?.provider ?? "Nenhum disponível"}</strong>
            {activeStatus?.available ? ` · ${activeModel}` : ""}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void refreshStatus(true)} disabled={isRefreshing}>
            <RefreshCw className={isRefreshing ? "animate-spin" : undefined} aria-hidden="true" />
            {isRefreshing ? "Verificando..." : "Atualizar status"}
          </Button>
        </div>

        <section aria-label="Status dos providers" className="grid gap-3 sm:grid-cols-2">
          {aiProviderOptions.map((option) => {
            const status = managerStatus?.providers.find((item) => item.provider === option.id);
            const selectedModel = models[option.id] ?? status?.models[0]?.name ?? "—";
            return (
              <div key={option.id} className="rounded-lg border bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{option.label}</p>
                  <Badge variant={status?.available ? "secondary" : "outline"}>
                    <span className={`size-1.5 rounded-full ${status?.available ? "bg-emerald-500" : "bg-muted-foreground/50"}`} />
                    {status?.available ? "Online" : "Offline"}
                  </Badge>
                </div>
                <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                  <div><dt className="text-muted-foreground">Latência</dt><dd>{status ? `${status.latencyMs} ms` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Tempo médio</dt><dd>{status ? `${status.averageResponseTimeMs ?? status.latencyMs} ms` : "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Modelo ativo</dt><dd className="truncate" title={selectedModel}>{selectedModel}</dd></div>
                  <div><dt className="text-muted-foreground">Memória</dt><dd>{formatMemory(status?.memoryBytes)}</dd></div>
                  <div><dt className="text-muted-foreground">Versão</dt><dd>{status?.version ?? "—"}</dd></div>
                  <div><dt className="text-muted-foreground">Última verificação</dt><dd>{status?.checkedAt ? dateFormatter.format(new Date(status.checkedAt)) : "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Endpoint utilizado</dt><dd className="break-all">{status?.endpoint ?? "—"}</dd></div>
                  <div className="col-span-2"><dt className="text-muted-foreground">Último erro</dt><dd className={status?.lastError || status?.error ? "text-destructive" : undefined}>{status?.lastError ?? status?.error ?? "Nenhum erro registrado"}</dd></div>
                </dl>
                <Button type="button" variant="outline" size="sm" className="mt-4 w-full" disabled={testingProvider === option.id} onClick={() => void testProvider(option.id)}>
                  <RefreshCw className={testingProvider === option.id ? "animate-spin" : undefined} />
                  {testingProvider === option.id ? "Testando..." : "Testar conexão"}
                </Button>
              </div>
            );
          })}
        </section>

        <div className="grid gap-3 rounded-lg border bg-muted/15 p-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Tempo médio</p><p className="mt-1 font-medium">{managerStatus?.statistics.averageResponseTimeMs ?? 0} ms</p></div>
          <div><p className="text-xs text-muted-foreground">Mensagens</p><p className="mt-1 font-medium">{managerStatus?.statistics.messages ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Tokens</p><p className="mt-1 font-medium">{managerStatus?.statistics.tokens?.toLocaleString("pt-BR") ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Fallbacks</p><p className="mt-1 font-medium">{managerStatus?.statistics.fallbacks ?? 0}</p></div>
        </div>
      </CardContent>
    </Card>
  );
}
