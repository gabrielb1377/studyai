/**
 * StudyAI — Adaptive Learning (AL-2)
 * Modelo de apresentação puro, sanitizado e determinístico para o Painel de Uso e Orçamento de IA.
 *
 * Princípios:
 * - Zero NaN, Infinity ou valores negativos.
 * - Separação explícita entre tokens consumidos (reconciliados), tokens reservados (em andamento) e saldo restante.
 * - Separação explícita entre consumo observado pelo provedor e estimativa conservadora.
 * - Limites desconhecidos são exibidos como "Não disponível" (jamais como "ilimitado" ou "gratuito").
 * - Orientação neutra ao atingir limites (sem forçar compra, upgrade ou troca de provedor).
 * - Reutiliza primitivas matemáticas da MM-1 (`computeNiceDomainMax`, `safeFinite`) sem nova dependência de gráficos.
 */

import { computeNiceDomainMax, safeFinite } from "@/features/analytics/charts/chartScale";
import type { AIProviderId } from "@/features/ai/AIProvider";

export interface AIQuotaWindowPayload {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
  resetAt: string;
}

export interface AITokenWindowPayload {
  used: number;
  reserved: number;
  limit: number;
  remaining: number;
  percent: number;
  resetAt: string;
}

export interface AIProviderModelUsagePayload {
  provider: string;
  model: string | null;
  credentialOrigin?: "shared" | "byok" | "local";
  requests: number;
  totalTokens: number;
  observedTokens: number;
  estimatedTokens: number;
}

export interface AIAccountingBreakdownPayload {
  date: string;
  observedTokens: number;
  estimatedTokens: number;
  pendingReservedTokens: number;
  pendingReservationsCount: number;
  reconciledCount: number;
  zeroTokenReconciledCount: number;
  failedOrCancelledCount: number;
  byProviderModel: AIProviderModelUsagePayload[];
  source: "reservations" | "unavailable";
}

export interface AIUsageDayStatPayload {
  date: string;
  requests: number;
  tokens: number;
}

export interface AIQuotaApiPayload {
  fetchedAt?: string;
  mode: "byok" | "shared";
  emailVerified?: boolean;
  sharedAvailable?: boolean;
  byokProviders?: AIProviderId[];
  daily?: AIQuotaWindowPayload;
  minute?: AIQuotaWindowPayload;
  tokens?: AITokenWindowPayload;
  accounting?: AIAccountingBreakdownPayload;
  availability?: {
    blockedRequestsTracked?: boolean;
    cacheHitsTracked?: boolean;
    externalProviderLimitsTracked?: boolean;
    monetaryCostTracked?: boolean;
  };
  warning?: "none" | "approaching" | "critical";
  usageStats?: AIUsageDayStatPayload[];
  hasAnyBYOK?: boolean;
}

export type BudgetMetricStatus = "ok" | "approaching" | "limit_reached" | "unknown";

export type UsagePanelOverallState =
  | "no_history"
  | "zero_usage"
  | "normal"
  | "reservations_in_flight"
  | "approaching_limit"
  | "limit_reached"
  | "partial_data";

export interface NormalizedWindowMetric {
  used: number;
  limit: number | null;
  remaining: number | null;
  percent: number;
  resetAt: string | null;
  status: BudgetMetricStatus;
}

export interface NormalizedTokenMetric {
  used: number;
  reserved: number;
  limit: number | null;
  remaining: number | null;
  usedPercent: number;
  reservedPercent: number;
  totalAllocatedPercent: number;
  resetAt: string | null;
  status: BudgetMetricStatus;
}

export interface ProviderLimitTransparencyRow {
  id: "shared" | "byok" | "ollama";
  title: string;
  scopeLabel: string;
  configured: boolean;
  providersLabel: string;
  limitSummary: string;
  note: string;
}

export interface UsageHistoryBarLayout {
  key: string;
  date: string;
  shortLabel: string;
  requests: number;
  tokens: number;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  isZero: boolean;
  isPeak: boolean;
  accessibleLabel: string;
}

export interface UsageHistoryChartLayout {
  width: number;
  height: number;
  plotTop: number;
  plotBottom: number;
  plotLeft: number;
  plotRight: number;
  domainMax: number;
  metric: "tokens" | "requests";
  dataStatus: "no_data" | "zero_values" | "has_data";
  bars: UsageHistoryBarLayout[];
  ticks: Array<{ value: number; y: number; label: string }>;
  description: string;
}

export interface AIUsageBudgetViewModel {
  fetchedAt: string | null;
  isStale: boolean;
  mode: "byok" | "shared";
  hasAnyBYOK: boolean;
  byokProviders: AIProviderId[];
  emailVerified: boolean | null;
  sharedAvailable: boolean | null;
  overallState: UsagePanelOverallState;
  overallStateLabel: string;
  guidanceMessage: string | null;
  daily: NormalizedWindowMetric;
  minute: NormalizedWindowMetric;
  tokens: NormalizedTokenMetric;
  accounting: {
    available: boolean;
    observedTokens: number;
    estimatedTokens: number;
    pendingReservedTokens: number;
    pendingReservationsCount: number;
    reconciledCount: number;
    zeroTokenReconciledCount: number;
    failedOrCancelledCount: number;
    byProviderModel: AIProviderModelUsagePayload[];
  };
  history30d: {
    days: AIUsageDayStatPayload[];
    totalRequests: number;
    totalTokens: number;
    hasHistory: boolean;
    chart: UsageHistoryChartLayout;
  };
  providerTransparency: ProviderLimitTransparencyRow[];
  unavailableNotices: string[];
}

export const STALE_THRESHOLD_MS = 2 * 60_000;

export function safeNonNegativeInt(value: unknown, fallback = 0): number {
  const numeric = typeof value === "number" ? value : Number(value);
  const n = safeFinite(numeric, fallback);
  if (n <= 0) return 0;
  return Math.trunc(n);
}

function safeValidIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function classifyMetricStatus(allocated: number, limit: number | null): BudgetMetricStatus {
  if (limit === null || limit <= 0) return "unknown";
  const ratio = allocated / limit;
  if (allocated >= limit || ratio >= 1) return "limit_reached";
  if (ratio >= 0.75) return "approaching";
  return "ok";
}

function formatCompactCount(value: number): string {
  const safe = safeNonNegativeInt(value, 0);
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(safe >= 10_000 ? 0 : 1).replace(".", ",")}k`;
  return String(safe);
}

function formatShortDateLabel(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (match) return `${match[3]}/${match[2]}`;
  return isoDate.slice(0, 5);
}

export function buildUsageHistoryChartLayout(
  days: readonly AIUsageDayStatPayload[],
): UsageHistoryChartLayout {
  const width = 560;
  const height = 188;
  const plotLeft = 48;
  const plotRight = 544;
  const plotTop = 22;
  const plotBottom = 148;
  const plotHeight = plotBottom - plotTop;
  const plotWidth = plotRight - plotLeft;

  const recent = [...days]
    .filter((d) => typeof d.date === "string" && d.date.trim().length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  if (recent.length === 0) {
    return {
      width,
      height,
      plotTop,
      plotBottom,
      plotLeft,
      plotRight,
      domainMax: 1,
      metric: "tokens",
      dataStatus: "no_data",
      bars: [],
      ticks: [],
      description: "Sem histórico diário registrado para a IA compartilhada nos últimos 30 dias.",
    };
  }

  const totalTokens = recent.reduce((sum, item) => sum + safeNonNegativeInt(item.tokens, 0), 0);
  const totalRequests = recent.reduce((sum, item) => sum + safeNonNegativeInt(item.requests, 0), 0);
  const metric: "tokens" | "requests" = totalTokens > 0 ? "tokens" : "requests";
  const values = recent.map((item) =>
    metric === "tokens" ? safeNonNegativeInt(item.tokens, 0) : safeNonNegativeInt(item.requests, 0),
  );
  const maxVal = Math.max(0, ...values);

  if (maxVal === 0) {
    const slotWidth = plotWidth / recent.length;
    const barWidth = Math.max(10, Math.min(34, slotWidth * 0.6));
    const bars: UsageHistoryBarLayout[] = recent.map((item, idx) => {
      const centerX = Number((plotLeft + slotWidth * idx + slotWidth / 2).toFixed(2));
      const x = Number((centerX - barWidth / 2).toFixed(2));
      const shortLabel = formatShortDateLabel(item.date);
      return {
        key: item.date,
        date: item.date,
        shortLabel,
        requests: 0,
        tokens: 0,
        x,
        y: plotBottom,
        width: Number(barWidth.toFixed(2)),
        height: 0,
        centerX,
        isZero: true,
        isPeak: false,
        accessibleLabel: `${shortLabel}: 0 requisições e 0 tokens`,
      };
    });
    return {
      width,
      height,
      plotTop,
      plotBottom,
      plotLeft,
      plotRight,
      domainMax: 1,
      metric,
      dataStatus: "zero_values",
      bars,
      ticks: [{ value: 0, y: plotBottom, label: "0" }],
      description: `Histórico de ${recent.length} dia(s) com 0 requisições e 0 tokens contabilizados.`,
    };
  }

  const domainMax = Math.max(1, computeNiceDomainMax(maxVal));
  const slotWidth = plotWidth / recent.length;
  const barWidth = Math.max(10, Math.min(34, slotWidth * 0.6));
  const bars: UsageHistoryBarLayout[] = recent.map((item, idx) => {
    const requests = safeNonNegativeInt(item.requests, 0);
    const tokens = safeNonNegativeInt(item.tokens, 0);
    const val = metric === "tokens" ? tokens : requests;
    const ratio = Math.min(1, Math.max(0, val / domainMax));
    const barHeight = val > 0 ? Math.max(3, Number((ratio * plotHeight).toFixed(2))) : 0;
    const centerX = Number((plotLeft + slotWidth * idx + slotWidth / 2).toFixed(2));
    const x = Number((centerX - barWidth / 2).toFixed(2));
    const y = Number((plotBottom - barHeight).toFixed(2));
    const shortLabel = formatShortDateLabel(item.date);
    const isPeak = val === maxVal && val > 0;
    return {
      key: item.date,
      date: item.date,
      shortLabel,
      requests,
      tokens,
      x,
      y,
      width: Number(barWidth.toFixed(2)),
      height: barHeight,
      centerX,
      isZero: val === 0,
      isPeak,
      accessibleLabel: `${shortLabel}: ${tokens.toLocaleString("pt-BR")} tokens em ${requests} ${
        requests === 1 ? "requisição" : "requisições"
      }${isPeak ? " (pico)" : ""}`,
    };
  });

  const tickValues = [0, Math.round(domainMax / 2), domainMax];
  const ticks = tickValues.map((val) => ({
    value: val,
    y: Number((plotBottom - (val / domainMax) * plotHeight).toFixed(2)),
    label: formatCompactCount(val),
  }));

  return {
    width,
    height,
    plotTop,
    plotBottom,
    plotLeft,
    plotRight,
    domainMax,
    metric,
    dataStatus: "has_data",
    bars,
    ticks,
    description: `Histórico diário da IA compartilhada nos últimos ${recent.length} dia(s) com registro: total de ${totalTokens.toLocaleString("pt-BR")} tokens em ${totalRequests} requisição(ões).`,
  };
}

export function buildAIUsageBudgetViewModel(
  payload: AIQuotaApiPayload,
  options: {
    nowMs?: number;
    selectedProvider?: AIProviderId;
    forceStale?: boolean;
  } = {},
): AIUsageBudgetViewModel {
  const nowMs = options.nowMs ?? Date.now();
  const fetchedAt = safeValidIso(payload.fetchedAt);
  const isStale =
    Boolean(options.forceStale) ||
    (fetchedAt !== null && nowMs - Date.parse(fetchedAt) > STALE_THRESHOLD_MS);

  const byokProviders: AIProviderId[] = Array.isArray(payload.byokProviders)
    ? payload.byokProviders.filter(
        (item): item is AIProviderId =>
          item === "gemini" || item === "groq" || item === "openrouter" || item === "ollama",
      )
    : [];
  const hasAnyBYOK = Boolean(payload.hasAnyBYOK || byokProviders.length > 0);
  const mode: "byok" | "shared" = payload.mode === "byok" || hasAnyBYOK ? "byok" : "shared";

  // 1. Janela diária de requisições
  const dailyLimit =
    payload.daily && Number.isFinite(payload.daily.limit) && payload.daily.limit > 0
      ? safeNonNegativeInt(payload.daily.limit)
      : null;
  const dailyUsed = safeNonNegativeInt(payload.daily?.used, 0);
  const dailyRemaining =
    dailyLimit !== null ? Math.max(0, dailyLimit - dailyUsed) : null;
  const dailyPercent =
    dailyLimit !== null ? Math.min(100, Math.round((dailyUsed / dailyLimit) * 100)) : 0;
  const daily: NormalizedWindowMetric = {
    used: dailyUsed,
    limit: dailyLimit,
    remaining: dailyRemaining,
    percent: dailyPercent,
    resetAt: safeValidIso(payload.daily?.resetAt),
    status: classifyMetricStatus(dailyUsed, dailyLimit),
  };

  // 2. Janela por minuto de requisições
  const minuteLimit =
    payload.minute && Number.isFinite(payload.minute.limit) && payload.minute.limit > 0
      ? safeNonNegativeInt(payload.minute.limit)
      : null;
  const minuteUsed = safeNonNegativeInt(payload.minute?.used, 0);
  const minuteRemaining =
    minuteLimit !== null ? Math.max(0, minuteLimit - minuteUsed) : null;
  const minutePercent =
    minuteLimit !== null ? Math.min(100, Math.round((minuteUsed / minuteLimit) * 100)) : 0;
  const minute: NormalizedWindowMetric = {
    used: minuteUsed,
    limit: minuteLimit,
    remaining: minuteRemaining,
    percent: minutePercent,
    resetAt: safeValidIso(payload.minute?.resetAt),
    status: classifyMetricStatus(minuteUsed, minuteLimit),
  };

  // 3. Janela diária de tokens (separando consumidos de reservados!)
  const tokenLimit =
    payload.tokens && Number.isFinite(payload.tokens.limit) && payload.tokens.limit > 0
      ? safeNonNegativeInt(payload.tokens.limit)
      : null;
  const tokenUsed = safeNonNegativeInt(payload.tokens?.used, 0);
  const tokenReserved = safeNonNegativeInt(payload.tokens?.reserved, 0);
  const tokenAllocated = tokenUsed + tokenReserved;
  const tokenRemaining =
    tokenLimit !== null ? Math.max(0, tokenLimit - tokenAllocated) : null;
  const usedPercent =
    tokenLimit !== null ? Math.min(100, Math.round((tokenUsed / tokenLimit) * 100)) : 0;
  const totalAllocatedPercent =
    tokenLimit !== null ? Math.min(100, Math.round((tokenAllocated / tokenLimit) * 100)) : 0;
  const reservedPercent = Math.max(0, totalAllocatedPercent - usedPercent);
  const tokens: NormalizedTokenMetric = {
    used: tokenUsed,
    reserved: tokenReserved,
    limit: tokenLimit,
    remaining: tokenRemaining,
    usedPercent,
    reservedPercent,
    totalAllocatedPercent,
    resetAt: safeValidIso(payload.tokens?.resetAt),
    status: classifyMetricStatus(tokenAllocated, tokenLimit),
  };

  // 4. Contabilização (observado vs estimado vs reservas pendentes vs reconciliações sem cobrança)
  const rawAcc = payload.accounting;
  const accountingAvailable = Boolean(rawAcc && rawAcc.source === "reservations");
  const accounting = {
    available: accountingAvailable,
    observedTokens: safeNonNegativeInt(rawAcc?.observedTokens, 0),
    estimatedTokens: safeNonNegativeInt(rawAcc?.estimatedTokens, 0),
    pendingReservedTokens: safeNonNegativeInt(rawAcc?.pendingReservedTokens, tokenReserved),
    pendingReservationsCount: safeNonNegativeInt(rawAcc?.pendingReservationsCount, 0),
    reconciledCount: safeNonNegativeInt(rawAcc?.reconciledCount, 0),
    zeroTokenReconciledCount: safeNonNegativeInt(rawAcc?.zeroTokenReconciledCount, 0),
    failedOrCancelledCount: safeNonNegativeInt(rawAcc?.failedOrCancelledCount, 0),
    byProviderModel: Array.isArray(rawAcc?.byProviderModel)
      ? rawAcc.byProviderModel.map((row) => ({
          provider: String(row.provider || "desconhecido"),
          model: row.model ? String(row.model) : null,
          credentialOrigin: (
            row.credentialOrigin === "byok" || row.credentialOrigin === "local"
              ? row.credentialOrigin
              : "shared"
          ) as "shared" | "byok" | "local",
          requests: safeNonNegativeInt(row.requests, 0),
          totalTokens: safeNonNegativeInt(row.totalTokens, 0),
          observedTokens: safeNonNegativeInt(row.observedTokens, 0),
          estimatedTokens: safeNonNegativeInt(row.estimatedTokens, 0),
        }))
      : [],
  };

  // 5. Histórico 30 dias
  const days: AIUsageDayStatPayload[] = Array.isArray(payload.usageStats)
    ? payload.usageStats
        .filter((d) => d && typeof d.date === "string" && d.date.trim().length > 0)
        .map((d) => ({
          date: d.date,
          requests: safeNonNegativeInt(d.requests, 0),
          tokens: safeNonNegativeInt(d.tokens, 0),
        }))
    : [];
  const totalRequests30d = days.reduce((sum, d) => sum + d.requests, 0);
  const totalTokens30d = days.reduce((sum, d) => sum + d.tokens, 0);
  const hasHistory = days.length > 0 && (totalRequests30d > 0 || totalTokens30d > 0);
  const chart = buildUsageHistoryChartLayout(days);

  // 6. Estado consolidado e orientação neutra (sem forçar compra, upgrade ou troca)
  const emailVerified = typeof payload.emailVerified === "boolean" ? payload.emailVerified : null;
  const sharedAvailable = typeof payload.sharedAvailable === "boolean" ? payload.sharedAvailable : null;
  const isPartial = dailyLimit === null || minuteLimit === null || tokenLimit === null || !accountingAvailable;

  const anyLimitReached =
    daily.status === "limit_reached" ||
    minute.status === "limit_reached" ||
    tokens.status === "limit_reached" ||
    (sharedAvailable === false && !hasAnyBYOK);
  const anyApproaching =
    daily.status === "approaching" ||
    minute.status === "approaching" ||
    tokens.status === "approaching";
  const hasReservations = tokens.reserved > 0 || accounting.pendingReservationsCount > 0;
  const zeroToday = dailyUsed === 0 && minuteUsed === 0 && tokenUsed === 0 && !hasReservations;

  let overallState: UsagePanelOverallState;
  let overallStateLabel: string;
  let guidanceMessage: string | null = null;

  if (anyLimitReached) {
    overallState = "limit_reached";
    overallStateLabel = "Limite atingido";
    if (sharedAvailable === false && !hasAnyBYOK) {
      guidanceMessage =
        "A capacidade compartilhada do StudyAI está temporariamente esgotada nesta janela. Você pode aguardar a próxima renovação ou revisar suas preferências de provedor em Configurações → IA.";
    } else if (minute.status === "limit_reached") {
      guidanceMessage =
        "O limite de requisições por minuto da IA compartilhada foi atingido. Aguarde a renovação da janela de 1 minuto antes de enviar uma nova solicitação.";
    } else {
      guidanceMessage =
        "O limite diário da IA compartilhada para esta conta foi atingido. A renovação ocorre automaticamente na próxima janela diária UTC.";
    }
  } else if (anyApproaching) {
    overallState = "approaching_limit";
    overallStateLabel = "Próximo do limite";
    guidanceMessage =
      "Seu consumo na IA compartilhada superou 75% do limite da janela atual. Priorize perguntas objetivas e acompanhe o horário de renovação exibido abaixo.";
  } else if (hasReservations) {
    overallState = "reservations_in_flight";
    overallStateLabel = "Reservas em andamento";
    guidanceMessage =
      "Há solicitações em andamento com tokens reservados temporariamente. Ao finalizar, apenas o consumo reconciliado será contabilizado e o restante é liberado.";
  } else if (isPartial) {
    overallState = "partial_data";
    overallStateLabel = "Dados parciais";
    guidanceMessage =
      "Parte do detalhamento de uso não está disponível nesta resposta; apenas as métricas confirmadas estão exibidas.";
  } else if (zeroToday && !hasHistory) {
    overallState = "no_history";
    overallStateLabel = "Sem histórico";
  } else if (zeroToday) {
    overallState = "zero_usage";
    overallStateLabel = "Uso zero hoje";
  } else {
    overallState = "normal";
    overallStateLabel = "Dentro do limite";
  }

  // 7. Transparência por origem (Limites internos StudyAI vs limites externos desconhecidos)
  const providerTransparency: ProviderLimitTransparencyRow[] = [
    {
      id: "shared",
      title: "IA Compartilhada (StudyAI)",
      scopeLabel: "Limites internos do StudyAI",
      configured: sharedAvailable !== false,
      providersLabel: "Chaves compartilhadas do servidor",
      limitSummary:
        dailyLimit !== null && tokenLimit !== null
          ? `${dailyLimit.toLocaleString("pt-BR")} req/dia · ${minuteLimit ?? "—"} req/min · ${tokenLimit.toLocaleString("pt-BR")} tokens/dia`
          : "Não disponível",
      note: "Cota individual diária e por minuto controlada pelo servidor do StudyAI (renovação diária à 00:00 UTC).",
    },
    {
      id: "byok",
      title: "Chave Própria (BYOK)",
      scopeLabel: "Limites externos do provedor",
      configured: hasAnyBYOK,
      providersLabel:
        byokProviders.length > 0 ? byokProviders.join(", ") : "Nenhuma chave pessoal cadastrada",
      limitSummary: "Não disponível",
      note: "Chaves BYOK não consomem a cota compartilhada do StudyAI. Limites, taxas e eventuais cobranças dependem exclusivamente da sua conta no provedor externo (não são ilimitados nem gratuitos por garantia do StudyAI).",
    },
    {
      id: "ollama",
      title: "Ollama (Local)",
      scopeLabel: "Recursos locais do dispositivo",
      configured: options.selectedProvider === "ollama",
      providersLabel: "Execução local no computador",
      limitSummary: "Não disponível",
      note: "A execução local não consome a cota compartilhada do StudyAI, mas está sujeita à capacidade de hardware, memória e energia do seu dispositivo.",
    },
  ];

  // 8. Avisos explícitos de lacunas reais (sem inventar métricas)
  const unavailableNotices: string[] = [
    "Limites externos, preços e gastos monetários de provedores (BYOK/externos): Não disponível.",
    "Contagem histórica de requisições bloqueadas (429/403/503): Não disponível na persistência atual.",
    "Acertos de cache de IA separados de outras reconciliações com 0 tokens: Não disponível na persistência atual.",
  ];

  return {
    fetchedAt,
    isStale,
    mode,
    hasAnyBYOK,
    byokProviders,
    emailVerified,
    sharedAvailable,
    overallState,
    overallStateLabel,
    guidanceMessage,
    daily,
    minute,
    tokens,
    accounting,
    history30d: {
      days,
      totalRequests: totalRequests30d,
      totalTokens: totalTokens30d,
      hasHistory,
      chart,
    },
    providerTransparency,
    unavailableNotices,
  };
}
