"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, RefreshCw, Gauge, AlertTriangle, CheckCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
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

interface QuotaData {
  mode: "byok" | "shared";
  daily: { used: number; limit: number; remaining: number; percent: number; resetAt: string };
  minute: { used: number; limit: number; remaining: number; percent: number; resetAt: string };
  warning: "none" | "approaching" | "critical";
  usageStats: Array<{ date: string; requests: number; tokens: number }>;
  hasAnyBYOK: boolean;
}

export function AISettingsPanel({ advanced = true }: { advanced?: boolean }) {
  const [mode, setMode] = useState<AISelectionMode>("manual");
  const [provider, setProvider] = useState<AIProviderId>("gemini");
  const [models, setModels] = useState<AIModelPreferences>({});
  const [managerStatus, setManagerStatus] = useState<AIManagerStatus | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [testingProvider, setTestingProvider] = useState<AIProviderId | null>(null);
  const [quotaData, setQuotaData] = useState<QuotaData | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(true);

  useEffect(() => {
    const settings = AISettings.load();
    setMode(settings.mode);
    setProvider(settings.provider);
    setModels(settings.models);
    setIsReady(true);
  }, []);

  useEffect(() => {
    const fetchQuota = async () => {
      try {
        const response = await fetch("/api/settings/ai/quota", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          setQuotaData(data);
        }
      } catch {
        // Silently fail - quota display is secondary
      } finally {
        setIsLoadingQuota(false);
      }
    };
    fetchQuota();
    const interval = window.setInterval(fetchQuota, 30_000);
    return () => window.clearInterval(interval);
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

  useEffect(() => {
    const first = activeStatus?.available ? activeStatus.models[0]?.name : undefined;
    if (isReady && mode === "manual" && first && !models[provider]) {
      setModels((current) => ({ ...current, [provider]: first }));
      AISettings.saveModel(provider, first);
    }
  }, [activeStatus, isReady, mode, models, provider]);

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
              : "Somente o provider escolhido será utilizado."}
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
              {models[provider] && !activeStatus?.models.some((item) => item.name === models[provider]) && <option value={models[provider]}>Modelo salvo indisponível: {models[provider]}</option>}
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

        {advanced && <section aria-label="Status dos providers" className="grid gap-3 sm:grid-cols-2">
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
        </section>}

        {advanced && <div className="grid gap-3 rounded-lg border bg-muted/15 p-4 text-sm sm:grid-cols-4">
          <div><p className="text-xs text-muted-foreground">Tempo médio</p><p className="mt-1 font-medium">{managerStatus?.statistics.averageResponseTimeMs ?? 0} ms</p></div>
          <div><p className="text-xs text-muted-foreground">Mensagens</p><p className="mt-1 font-medium">{managerStatus?.statistics.messages ?? 0}</p></div>
          <div><p className="text-xs text-muted-foreground">Tokens</p><p className="mt-1 font-medium">{managerStatus?.statistics.tokens?.toLocaleString("pt-BR") ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground">Fallbacks</p><p className="mt-1 font-medium">{managerStatus?.statistics.fallbacks ?? 0}</p></div>
        </div>}

        {/* Quota Consumption Section */}
        <section aria-label="Consumo de quota compartilhada" className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Consumo de Quota Compartilhada</h3>
            <Badge variant={quotaData?.mode === "byok" ? "secondary" : "default"} className="gap-1">
              {quotaData?.mode === "byok" ? (
                <> <CheckCircle className="size-3" /> BYOK Ativo </>
              ) : (
                <> <Gauge className="size-3" /> Modo Compartilhado </>
              )}
            </Badge>
          </div>

          {isLoadingQuota ? (
            <div className="flex items-center justify-center py-4">
              <Gauge className="size-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Carregando quota...</span>
            </div>
          ) : quotaData ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 rounded-lg border bg-muted/15 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Quota Diária</p>
                      <p className="text-sm font-medium">{quotaData.daily.used} / {quotaData.daily.limit}</p>
                    </div>
                    <Badge variant={quotaData.warning === "critical" ? "destructive" : quotaData.warning === "approaching" ? "secondary" : "outline"}>
                      {quotaData.warning === "critical" ? "Crítico" : quotaData.warning === "approaching" ? "Atenção" : "OK"}
                    </Badge>
                  </div>
                  <Progress value={quotaData.daily.percent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Restam {quotaData.daily.remaining} de {quotaData.daily.limit} · Reset à meia-noite
                  </p>
                </div>

                <div className="space-y-2 rounded-lg border bg-muted/15 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground">Quota por Minuto</p>
                      <p className="text-sm font-medium">{quotaData.minute.used} / {quotaData.minute.limit}</p>
                    </div>
                    <Badge variant={quotaData.warning === "critical" ? "destructive" : quotaData.warning === "approaching" ? "secondary" : "outline"}>
                      {quotaData.warning === "critical" ? "Crítico" : quotaData.warning === "approaching" ? "Atenção" : "OK"}
                    </Badge>
                  </div>
                  <Progress value={quotaData.minute.percent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    Restam {quotaData.minute.remaining} de {quotaData.minute.limit} · Reset em {new Date(quotaData.minute.resetAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>

              {quotaData.warning !== "none" && (
                <div className="rounded-lg border bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                  <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">Quota se aproximando do limite</p>
                    <p className="text-xs text-muted-foreground">
                      {quotaData.warning === "critical"
                        ? "Você atingiu 90% da quota. Configure sua própria chave API (BYOK) em Configurações → IA → Gerenciador de IA para continuar sem limites."
                        : "Você atingiu 75% da quota. Considere configurar BYOK para evitar interrupções."}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Últimos 30 dias: {quotaData.usageStats?.reduce((sum, day) => sum + day.requests, 0) ?? 0} requisições</span>
                <span>Próximo reset diário: {new Date(quotaData.daily.resetAt).toLocaleString("pt-BR")}</span>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              Não foi possível carregar informações de quota.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
