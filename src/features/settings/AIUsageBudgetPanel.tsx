"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  Info,
  RefreshCw,
  ShieldCheck,
  Table2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import type { AIProviderId } from "@/features/ai/AIProvider";
import {
  buildAIUsageBudgetViewModel,
  type AIQuotaApiPayload,
  type BudgetMetricStatus,
  type UsageHistoryChartLayout,
} from "./aiUsageViewModel";

const timeFormatter = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatResetTime(iso: string | null, includeDate = false): string {
  if (!iso) return "Não disponível";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "Não disponível";
  return includeDate ? dateTimeFormatter.format(parsed) : timeFormatter.format(parsed);
}

function statusBadgeProps(status: BudgetMetricStatus): {
  label: string;
  variant: "outline" | "secondary" | "destructive";
} {
  switch (status) {
    case "limit_reached":
      return { label: "Limite atingido", variant: "destructive" };
    case "approaching":
      return { label: "Próximo do limite", variant: "secondary" };
    case "unknown":
      return { label: "Não disponível", variant: "outline" };
    default:
      return { label: "OK", variant: "outline" };
  }
}

function UsageHistorySvgChart({ layout }: { layout: UsageHistoryChartLayout }) {
  const baseId = useId();
  const titleId = `${baseId}-title`;
  const descId = `${baseId}-desc`;
  const tableId = `${baseId}-table`;
  const [showTable, setShowTable] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(() =>
    Math.max(0, layout.bars.length - 1),
  );
  const barRefs = useRef<Array<SVGGElement | null>>([]);

  const safeIndex =
    layout.bars.length > 0
      ? Math.min(Math.max(0, selectedIndex), layout.bars.length - 1)
      : 0;
  const activeBar = layout.bars[safeIndex];

  const handleBarKeyDown = (event: React.KeyboardEvent<SVGGElement>, index: number) => {
    const count = layout.bars.length;
    if (count === 0) return;
    let next: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      next = (index + 1) % count;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      next = (index - 1 + count) % count;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = count - 1;
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setSelectedIndex(next);
      barRefs.current[next]?.focus();
    }
  };

  if (layout.dataStatus === "no_data") {
    return (
      <p
        data-usage-history-status="no_data"
        className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground"
      >
        Nenhum registro diário persistido nos últimos 30 dias para a IA compartilhada.
      </p>
    );
  }

  return (
    <div className="relative min-w-0 space-y-2.5" data-usage-history-status={layout.dataStatus}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-normal">
            {layout.metric === "tokens" ? "Tokens/dia" : "Requisições/dia"}
          </Badge>
          {activeBar ? (
            <span aria-live="polite" className="font-medium text-foreground tabular-nums">
              {activeBar.shortLabel}: {activeBar.tokens.toLocaleString("pt-BR")} tokens ·{" "}
              {activeBar.requests} {activeBar.requests === 1 ? "req" : "reqs"}
              {activeBar.isPeak ? " (pico)" : ""}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs motion-reduce:transition-none"
          aria-expanded={showTable}
          aria-controls={tableId}
          onClick={() => setShowTable((prev) => !prev)}
        >
          <Table2 className="mr-1 size-3.5" aria-hidden="true" />
          {showTable ? "Ocultar tabela" : "Ver tabela"}
        </Button>
      </div>

      <div className="w-full min-w-0 overflow-hidden">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descId}
          className="block h-auto w-full max-w-full select-none text-foreground"
        >
          <title id={titleId}>Gráfico: Histórico diário de uso de IA compartilhada</title>
          <desc id={descId}>{layout.description}</desc>

          {/* Grades horizontais */}
          <g aria-hidden="true">
            {layout.ticks.map((tick) => (
              <g key={`tick-${tick.value}`}>
                <line
                  x1={layout.plotLeft}
                  y1={tick.y}
                  x2={layout.plotRight}
                  y2={tick.y}
                  className="stroke-border"
                  strokeWidth={1}
                  strokeDasharray={tick.value === 0 ? undefined : "3 3"}
                />
                <text
                  x={layout.plotLeft - 8}
                  y={tick.y + 3.5}
                  textAnchor="end"
                  className="fill-muted-foreground text-[10px] tabular-nums"
                >
                  {tick.label}
                </text>
              </g>
            ))}
          </g>

          {/* Barras interativas navegáveis por teclado */}
          <g role="group" aria-label="Pontos diários do histórico de uso de IA">
            {layout.bars.map((bar, index) => {
              const isSelected = index === safeIndex;
              return (
                <g
                  key={bar.key}
                  ref={(el) => {
                    barRefs.current[index] = el;
                  }}
                  role="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={bar.accessibleLabel}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onKeyDown={(event) => handleBarKeyDown(event, index)}
                  className="cursor-pointer outline-none focus-visible:[&_.usage-focus-ring]:stroke-ring"
                >
                  <rect
                    x={Number((bar.x - 3).toFixed(2))}
                    y={layout.plotTop - 10}
                    width={Number((bar.width + 6).toFixed(2))}
                    height={Number((layout.plotBottom - layout.plotTop + 34).toFixed(2))}
                    rx={5}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={2}
                    className="usage-focus-ring"
                  />
                  {bar.isZero ? (
                    <line
                      x1={bar.x}
                      y1={layout.plotBottom - 1}
                      x2={Number((bar.x + bar.width).toFixed(2))}
                      y2={layout.plotBottom - 1}
                      className="stroke-muted-foreground/60"
                      strokeWidth={2}
                      strokeDasharray="3 2"
                    />
                  ) : (
                    <rect
                      x={bar.x}
                      y={bar.y}
                      width={bar.width}
                      height={bar.height}
                      rx={4}
                      className={
                        isSelected
                          ? "fill-primary transition-opacity motion-reduce:transition-none"
                          : "fill-primary/70 hover:fill-primary transition-opacity motion-reduce:transition-none"
                      }
                      stroke={bar.isPeak || isSelected ? "currentColor" : "none"}
                      strokeWidth={bar.isPeak || isSelected ? 1.25 : 0}
                    />
                  )}
                  {bar.isPeak && !bar.isZero ? (
                    <polygon
                      aria-hidden="true"
                      points={`${bar.centerX},${Number((bar.y - 10).toFixed(2))} ${Number((bar.centerX + 3.5).toFixed(2))},${Number((bar.y - 6.5).toFixed(2))} ${bar.centerX},${Number((bar.y - 3).toFixed(2))} ${Number((bar.centerX - 3.5).toFixed(2))},${Number((bar.y - 6.5).toFixed(2))}`}
                      className="fill-primary"
                    />
                  ) : null}
                  <text
                    aria-hidden="true"
                    x={bar.centerX}
                    y={layout.plotBottom + 15}
                    textAnchor="middle"
                    className={
                      isSelected
                        ? "fill-foreground text-[10px] font-semibold"
                        : "fill-muted-foreground text-[10px]"
                    }
                  >
                    {bar.shortLabel}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Tabela semântica equivalente acessível (sempre no DOM para leitores de tela e expansível) */}
      <div
        id={tableId}
        className={showTable ? "overflow-x-auto rounded-lg border" : "sr-only left-0 top-0"}
      >
        <table
          aria-label="Tabela equivalente: Histórico diário de uso de IA"
          className="w-full border-collapse text-left text-xs"
        >
          <caption className="sr-only">
            Tabela equivalente com requisições e tokens diários da IA compartilhada.
          </caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Data</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Requisições</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tokens</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {layout.bars.map((bar) => (
              <tr key={bar.key}>
                <th scope="row" className="px-3 py-1.5 font-medium text-foreground">
                  {bar.shortLabel}
                  {bar.isPeak ? " (pico)" : ""}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {bar.requests.toLocaleString("pt-BR")}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {bar.tokens.toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AIUsageBudgetPanel({
  selectedProvider,
}: {
  selectedProvider?: AIProviderId;
}) {
  const { session, isLoading: authLoading } = useAuth();
  const activeUserId = session?.user.id ?? null;

  const [payload, setPayload] = useState<AIQuotaApiPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [requiresAuth, setRequiresAuth] = useState(false);
  const [staleBecauseError, setStaleBecauseError] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const requestSeqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadUsage = useCallback(async (manual = false) => {
    const seq = ++requestSeqRef.current;
    const sessionSnap = SessionOperationManager.current();

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (manual) setIsRefreshing(true);
    try {
      const response = await fetch("/api/settings/ai/quota", {
        cache: "no-store",
        signal: controller.signal,
      });

      const afterSnap = SessionOperationManager.current();
      if (
        seq !== requestSeqRef.current ||
        afterSnap.generation !== sessionSnap.generation ||
        afterSnap.userId !== sessionSnap.userId
      ) {
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setPayload(null);
        setRequiresAuth(true);
        setFetchError(null);
        setStaleBecauseError(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP_${response.status}`);
      }

      const data = (await response.json()) as AIQuotaApiPayload;
      if (seq !== requestSeqRef.current) return;

      setPayload(data);
      setRequiresAuth(false);
      setFetchError(null);
      setStaleBecauseError(false);
      setNowTick(Date.now());
    } catch (caught) {
      if (controller.signal.aborted || seq !== requestSeqRef.current) return;
      const message =
        caught instanceof Error && caught.message.startsWith("HTTP_")
          ? "Não foi possível consultar o servidor de uso e orçamento de IA."
          : "Falha de conexão ao consultar uso e orçamento de IA.";
      setFetchError(message);
      setStaleBecauseError(true);
    } finally {
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  // Reage à troca de conta A→B limpando imediatamente estado da conta anterior
  useEffect(() => {
    requestSeqRef.current += 1;
    abortRef.current?.abort();
    setPayload(null);
    setFetchError(null);
    setRequiresAuth(false);
    setStaleBecauseError(false);
    setIsLoading(true);

    if (authLoading) return;

    void loadUsage(false);
    const poll = window.setInterval(() => {
      void loadUsage(false);
    }, 30_000);
    const clock = window.setInterval(() => setNowTick(Date.now()), 30_000);

    return () => {
      requestSeqRef.current += 1;
      abortRef.current?.abort();
      window.clearInterval(poll);
      window.clearInterval(clock);
    };
  }, [activeUserId, authLoading, loadUsage]);

  const vm = useMemo(() => {
    if (!payload) return null;
    return buildAIUsageBudgetViewModel(payload, {
      nowMs: nowTick,
      selectedProvider,
      forceStale: staleBecauseError,
    });
  }, [nowTick, payload, selectedProvider, staleBecauseError]);

  const dailyBadge = vm ? statusBadgeProps(vm.daily.status) : null;
  const minuteBadge = vm ? statusBadgeProps(vm.minute.status) : null;
  const tokenBadge = vm ? statusBadgeProps(vm.tokens.status) : null;

  return (
    <section
      aria-labelledby="al2-usage-budget-heading"
      className="min-w-0 space-y-4 rounded-xl border bg-muted/10 p-4"
      data-al2-state={
        isLoading
          ? "loading"
          : requiresAuth
            ? "unauthenticated"
            : !vm && fetchError
              ? "error"
              : vm?.overallState ?? "unavailable"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Gauge className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <h3 id="al2-usage-budget-heading" className="text-sm font-semibold">
              Uso e orçamento de IA
            </h3>
            {vm ? (
              <Badge
                variant={
                  vm.overallState === "limit_reached"
                    ? "destructive"
                    : vm.overallState === "approaching_limit" || vm.overallState === "reservations_in_flight"
                      ? "secondary"
                      : "outline"
                }
              >
                {vm.overallStateLabel}
              </Badge>
            ) : null}
            {vm?.isStale ? (
              <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-300">
                <Clock3 className="size-3" aria-hidden="true" />
                Dados desatualizados
              </Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Contabilização real da conta autenticada. Esta consulta é somente leitura e não consome cota de IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vm ? (
            <Badge variant={vm.mode === "byok" ? "secondary" : "default"} className="gap-1">
              {vm.mode === "byok" ? (
                <>
                  <CheckCircle2 className="size-3" aria-hidden="true" />
                  BYOK configurado
                </>
              ) : (
                <>
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  IA compartilhada
                </>
              )}
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isLoading || isRefreshing}
            onClick={() => void loadUsage(true)}
            className="h-8 text-xs motion-reduce:transition-none"
          >
            <RefreshCw
              className={`size-3.5 ${isRefreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
            {isRefreshing ? "Atualizando..." : "Atualizar uso"}
          </Button>
        </div>
      </div>

      {/* Estado: Carregando */}
      {isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="grid gap-3 sm:grid-cols-2"
        >
          <div className="h-24 animate-pulse rounded-lg border bg-muted/30 motion-reduce:animate-none" />
          <div className="h-24 animate-pulse rounded-lg border bg-muted/30 motion-reduce:animate-none" />
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Carregando uso e orçamento de IA...
          </p>
        </div>
      ) : null}

      {/* Estado: Não autenticado / modo local sem sessão */}
      {!isLoading && requiresAuth ? (
        <div
          role="status"
          className="space-y-2 rounded-lg border border-dashed bg-background/70 p-4 text-xs text-muted-foreground"
        >
          <p className="font-medium text-foreground">
            Sessão autenticada necessária para consultar a cota compartilhada
          </p>
          <p>
            No modo local sem conta autenticada, os dados de uso e limites da IA compartilhada do servidor não estão disponíveis. Limites externos de BYOK ou recursos locais do Ollama são exibidos como Não disponível.
          </p>
        </div>
      ) : null}

      {/* Estado: Falha de conexão / backend sem snapshot prévio */}
      {!isLoading && !requiresAuth && !vm && fetchError ? (
        <div
          role="alert"
          className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
        >
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-medium">Dados de uso indisponíveis no momento</p>
              <p>{fetchError}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void loadUsage(true)}
            className="h-8 text-xs"
          >
            Tentar novamente
          </Button>
        </div>
      ) : null}

      {/* Conteúdo principal com snapshot válido */}
      {!isLoading && vm ? (
        <div className="min-w-0 space-y-4">
          {/* Aviso de revalidação falhada mantendo snapshot anterior */}
          {fetchError ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
            >
              <span>{fetchError} Exibindo a última leitura confirmada.</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadUsage(true)}
                className="h-7 text-xs"
              >
                Tentar novamente
              </Button>
            </div>
          ) : null}

          {/* Aviso de e-mail pendente de verificação para IA compartilhada */}
          {vm.emailVerified === false && !vm.hasAnyBYOK ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-900 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div className="space-y-0.5">
                <p className="font-medium">E-mail pendente de verificação</p>
                <p>
                  Confirme seu e-mail em Conta para habilitar solicitações com a IA compartilhada do StudyAI.
                </p>
              </div>
            </div>
          ) : null}

          {/* Orientação neutra (próximo do limite, limite atingido, reservas ou dados parciais) */}
          {vm.guidanceMessage ? (
            <div
              role={vm.overallState === "limit_reached" ? "alert" : "status"}
              className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                vm.overallState === "limit_reached"
                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                  : "border-primary/20 bg-primary/5 text-foreground"
              }`}
            >
              {vm.overallState === "limit_reached" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              )}
              <p className="min-w-0 flex-1 leading-5">{vm.guidanceMessage}</p>
            </div>
          ) : null}

          {/* Estados explícitos: Sem histórico ou Uso zero hoje */}
          {vm.overallState === "no_history" ? (
            <p className="rounded-lg border border-dashed bg-background/70 px-3 py-2.5 text-xs text-muted-foreground">
              Sem histórico de uso na IA compartilhada até o momento. Os contadores abaixo refletem sua cota disponível na janela atual.
            </p>
          ) : vm.overallState === "zero_usage" ? (
            <p className="rounded-lg border bg-background/70 px-3 py-2.5 text-xs text-muted-foreground">
              Uso zero registrado na janela de hoje. Seu histórico anterior permanece disponível abaixo.
            </p>
          ) : null}

          {/* Cards de janelas: Diária (requisições) e Por Minuto */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-2 rounded-lg border bg-background/80 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Requisições diárias (UTC)</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {vm.daily.used.toLocaleString("pt-BR")} /{" "}
                    {vm.daily.limit !== null
                      ? vm.daily.limit.toLocaleString("pt-BR")
                      : "Não disponível"}
                  </p>
                </div>
                {dailyBadge ? (
                  <Badge variant={dailyBadge.variant}>{dailyBadge.label}</Badge>
                ) : null}
              </div>
              <Progress
                value={vm.daily.percent}
                aria-label="Uso de requisições diárias"
                className="h-2"
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {vm.daily.remaining !== null
                  ? `Restam ${vm.daily.remaining.toLocaleString("pt-BR")} requisições`
                  : "Saldo restante: Não disponível"}{" "}
                · Renova em {formatResetTime(vm.daily.resetAt, true)}
              </p>
            </div>

            <div className="min-w-0 space-y-2 rounded-lg border bg-background/80 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Requisições por minuto</p>
                  <p className="text-sm font-semibold tabular-nums">
                    {vm.minute.used.toLocaleString("pt-BR")} /{" "}
                    {vm.minute.limit !== null
                      ? vm.minute.limit.toLocaleString("pt-BR")
                      : "Não disponível"}
                  </p>
                </div>
                {minuteBadge ? (
                  <Badge variant={minuteBadge.variant}>{minuteBadge.label}</Badge>
                ) : null}
              </div>
              <Progress
                value={vm.minute.percent}
                aria-label="Uso de requisições por minuto"
                className="h-2"
              />
              <p className="text-xs text-muted-foreground tabular-nums">
                {vm.minute.remaining !== null
                  ? `Restam ${vm.minute.remaining.toLocaleString("pt-BR")} nesta janela`
                  : "Saldo restante: Não disponível"}{" "}
                · Renova às {formatResetTime(vm.minute.resetAt)}
              </p>
            </div>
          </div>

          {/* Card de Orçamento Diário de Tokens — separando Consumido, Reservado e Restante */}
          <div className="min-w-0 space-y-3 rounded-lg border bg-background/80 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">
                  Orçamento diário de tokens (IA compartilhada · limites internos do StudyAI)
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  Consumido: {vm.tokens.used.toLocaleString("pt-BR")} /{" "}
                  {vm.tokens.limit !== null
                    ? `${vm.tokens.limit.toLocaleString("pt-BR")} tokens`
                    : "Não disponível"}
                </p>
              </div>
              {tokenBadge ? (
                <Badge variant={tokenBadge.variant}>
                  {vm.tokens.limit !== null
                    ? `${vm.tokens.totalAllocatedPercent}% alocado`
                    : tokenBadge.label}
                </Badge>
              ) : null}
            </div>

            {/* Barra empilhada distinguindo consumo realizado vs reserva temporária */}
            <div
              role="progressbar"
              aria-label="Alocação diária de tokens da IA compartilhada"
              aria-valuemin={0}
              aria-valuemax={vm.tokens.limit ?? 100}
              aria-valuenow={vm.tokens.used + vm.tokens.reserved}
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary"
            >
              <div
                className="h-full bg-primary transition-[width] motion-reduce:transition-none"
                style={{ width: `${vm.tokens.usedPercent}%` }}
                title={`Consumido (reconciliado): ${vm.tokens.used.toLocaleString("pt-BR")} tokens`}
              />
              {vm.tokens.reservedPercent > 0 ? (
                <div
                  className="h-full bg-amber-500/70 transition-[width] motion-reduce:transition-none"
                  style={{ width: `${vm.tokens.reservedPercent}%` }}
                  title={`Reservado em andamento: ${vm.tokens.reserved.toLocaleString("pt-BR")} tokens`}
                />
              ) : null}
            </div>

            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              <div className="min-w-0 rounded-md border bg-muted/20 p-2.5">
                <dt className="text-muted-foreground">Consumido (reconciliado)</dt>
                <dd className="mt-0.5 font-semibold text-foreground tabular-nums">
                  {vm.tokens.used.toLocaleString("pt-BR")} tokens
                </dd>
              </div>
              <div className="min-w-0 rounded-md border bg-muted/20 p-2.5">
                <dt className="text-muted-foreground">Reservado (em andamento)</dt>
                <dd className="mt-0.5 font-semibold text-foreground tabular-nums">
                  {vm.tokens.reserved.toLocaleString("pt-BR")} tokens
                  {vm.accounting.pendingReservationsCount > 0
                    ? ` (${vm.accounting.pendingReservationsCount} ativa${vm.accounting.pendingReservationsCount > 1 ? "s" : ""})`
                    : ""}
                </dd>
              </div>
              <div className="min-w-0 rounded-md border bg-muted/20 p-2.5">
                <dt className="text-muted-foreground">Saldo restante hoje</dt>
                <dd className="mt-0.5 font-semibold text-foreground tabular-nums">
                  {vm.tokens.remaining !== null
                    ? `${vm.tokens.remaining.toLocaleString("pt-BR")} tokens`
                    : "Não disponível"}
                </dd>
              </div>
            </dl>

            {/* Contabilização real (provider) vs estimada conservadoramente vs cache hits */}
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium text-foreground">
                Origem da contabilização hoje
              </p>
              {vm.accounting.available ? (
                <dl className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="min-w-0 rounded-md border bg-muted/15 p-2">
                    <dt className="text-muted-foreground">Observado pelo provedor</dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {vm.accounting.observedTokens.toLocaleString("pt-BR")} tokens
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-md border bg-muted/15 p-2">
                    <dt className="text-muted-foreground">Estimado conservadoramente</dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {vm.accounting.estimatedTokens.toLocaleString("pt-BR")} tokens
                    </dd>
                  </div>
                  <div className="min-w-0 rounded-md border bg-muted/15 p-2">
                    <dt className="text-muted-foreground">Cache hits sem nova cobrança</dt>
                    <dd className="mt-0.5 font-medium text-foreground tabular-nums">
                      {vm.accounting.cacheHitsCount.toLocaleString("pt-BR")}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Detalhamento entre consumo observado e estimado: Não disponível nesta leitura.
                </p>
              )}

              {vm.accounting.byProviderModel.length > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <p className="text-xs font-medium text-foreground">
                    Distribuição registrada hoje por provedor / modelo
                  </p>
                  <div className="overflow-x-auto rounded-lg border">
                    <table
                      aria-label="Uso diário por provedor e modelo"
                      className="w-full border-collapse text-left text-xs"
                    >
                      <thead className="border-b bg-muted/40 text-muted-foreground">
                        <tr>
                          <th scope="col" className="px-2.5 py-1.5 font-medium">Provedor / Modelo</th>
                          <th scope="col" className="px-2.5 py-1.5 text-right font-medium">Reqs</th>
                          <th scope="col" className="px-2.5 py-1.5 text-right font-medium">Observado</th>
                          <th scope="col" className="px-2.5 py-1.5 text-right font-medium">Estimado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vm.accounting.byProviderModel.map((row) => (
                          <tr key={`${row.provider}-${row.model ?? "default"}`}>
                            <th scope="row" className="px-2.5 py-1.5 font-medium text-foreground">
                              {row.provider}
                              {row.model ? ` · ${row.model}` : ""}
                            </th>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">
                              {row.requests.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">
                              {row.observedTokens.toLocaleString("pt-BR")}
                            </td>
                            <td className="px-2.5 py-1.5 text-right tabular-nums">
                              {row.estimatedTokens.toLocaleString("pt-BR")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* Gráfico SVG acessível + tabela equivalente do histórico de 30 dias */}
          <div className="min-w-0 space-y-2.5 rounded-lg border bg-background/80 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground">
                  Histórico recente (últimos 30 dias · IA compartilhada)
                </h4>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  Total registrado: {vm.history30d.totalRequests.toLocaleString("pt-BR")} requisições ·{" "}
                  {vm.history30d.totalTokens.toLocaleString("pt-BR")} tokens
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground">
                Reset diário: {formatResetTime(vm.daily.resetAt, true)}
              </span>
            </div>
            <UsageHistorySvgChart layout={vm.history30d.chart} />
          </div>

          {/* Transparência de limites por origem: StudyAI vs BYOK vs Ollama */}
          <div className="min-w-0 space-y-2 rounded-lg border bg-background/80 p-3.5">
            <h4 className="text-xs font-semibold text-foreground">
              Limites por origem de execução
            </h4>
            <div className="grid gap-2.5 sm:grid-cols-3">
              {vm.providerTransparency.map((row) => (
                <div
                  key={row.id}
                  className="min-w-0 space-y-1.5 rounded-lg border bg-muted/15 p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <p className="font-medium text-foreground">{row.title}</p>
                    <Badge variant={row.configured ? "secondary" : "outline"} className="text-[10px]">
                      {row.scopeLabel}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{row.providersLabel}</p>
                  <p className="font-medium text-foreground tabular-nums">
                    Limite: {row.limitSummary}
                  </p>
                  <p className="text-[11px] leading-4 text-muted-foreground">{row.note}</p>
                </div>
              ))}
            </div>
            <ul className="space-y-1 border-t pt-2 text-[11px] text-muted-foreground">
              {vm.unavailableNotices.map((notice) => (
                <li key={notice}>• {notice}</li>
              ))}
            </ul>
          </div>

          {vm.fetchedAt ? (
            <p className="text-right text-[11px] text-muted-foreground tabular-nums">
              Última atualização: {formatResetTime(vm.fetchedAt, true)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
