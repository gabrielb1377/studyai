/**
 * StudyAI — MM-1: Escalas determinísticas e formatação para gráficos SVG de desempenho.
 *
 * Regras de integridade (STUDYAI_FUTURE_ROADMAP.md §3 MM-1):
 * - Zero dependências externas de visualização.
 * - Nunca emite NaN ou Infinity em atributos SVG.
 * - Diferencia explicitamente ausência de dados (`no_data`), valor zero (`zero_values`),
 *   métricas observadas e indicadores derivados/estimados.
 * - Trata séries vazias, valores iguais e valores extremos com escalas matematicamente corretas.
 */

import type { AnalyticsBreakdown, AnalyticsPeriodPoint, RetentionMetric } from "../types";

export type ChartDataStatus = "no_data" | "zero_values" | "has_data";

export function safeFinite(value: number, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampPercent(value: number): number {
  const safe = safeFinite(value, 0);
  return Math.max(0, Math.min(100, Math.round(safe)));
}

const numberFormatterPtBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const integerFormatterPtBR = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export function formatMinutesShort(minutes: number): string {
  const safe = Math.max(0, safeFinite(minutes, 0));
  if (safe === 0) return "0 min";
  if (safe < 60) return `${integerFormatterPtBR.format(Math.round(safe))} min`;
  if (safe < 10_000) {
    const hours = Math.round((safe / 60) * 10) / 10;
    return `${numberFormatterPtBR.format(hours)} h`;
  }
  const hours = Math.round(safe / 60);
  return `${integerFormatterPtBR.format(hours)} h`;
}

export function formatMinutesExact(minutes: number): string {
  const safe = Math.max(0, safeFinite(minutes, 0));
  if (safe === 0) return "0 min";
  if (safe < 10) return `${numberFormatterPtBR.format(Number(safe.toFixed(1)))} min`;
  return `${integerFormatterPtBR.format(Math.round(safe))} min`;
}

export function formatPercent(value: number): string {
  return `${clampPercent(value)}%`;
}

/**
 * Calcula um teto "limpo" (nice number) para o eixo Y, garantindo escala legível
 * inclusive para valores iguais (ex.: [45, 45, 45]) ou valores extremos (ex.: 1e6).
 */
export function computeNiceDomainMax(rawMax: number): number {
  const safe = Math.max(0, safeFinite(rawMax, 0));
  if (safe <= 0) return 60;
  const magnitude = Math.pow(10, Math.floor(Math.log10(safe)));
  const normalized = safe / magnitude;
  let niceFactor: number;
  if (normalized <= 1) niceFactor = 1.2;
  else if (normalized <= 2) niceFactor = 2;
  else if (normalized <= 5) niceFactor = 5;
  else niceFactor = 10;
  const candidate = niceFactor * magnitude;
  // Garante folga visual quando o máximo encosta no teto (ex.: todos os pontos iguais)
  if (candidate <= safe * 1.05) {
    return Math.ceil(safe * 1.2);
  }
  return Math.max(1, Number(candidate.toFixed(2)));
}

export interface PeriodBarPoint {
  readonly key: string;
  readonly label: string;
  readonly minutes: number;
  readonly activities: number;
  readonly isZero: boolean;
  readonly isPeak: boolean;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly formattedValue: string;
  readonly accessibleLabel: string;
}

export interface PeriodTick {
  readonly value: number;
  readonly y: number;
  readonly label: string;
}

export interface PeriodChartLayout {
  readonly dataStatus: ChartDataStatus;
  readonly width: number;
  readonly height: number;
  readonly plotLeft: number;
  readonly plotRight: number;
  readonly plotTop: number;
  readonly plotBottom: number;
  readonly domainMax: number;
  readonly totalMinutes: number;
  readonly totalActivities: number;
  readonly peakKey: string | null;
  readonly ticks: readonly PeriodTick[];
  readonly bars: readonly PeriodBarPoint[];
  readonly description: string;
}

export function computePeriodChartLayout(
  data: readonly AnalyticsPeriodPoint[],
  label: string,
  dims: { readonly width?: number; readonly height?: number } = {},
): PeriodChartLayout {
  const width = Math.max(240, safeFinite(dims.width ?? 560, 560));
  const height = Math.max(160, safeFinite(dims.height ?? 220, 220));
  const plotLeft = 56;
  const plotRight = width - 16;
  const plotTop = 26;
  const plotBottom = height - 34;
  const plotWidth = Math.max(1, plotRight - plotLeft);
  const plotHeight = Math.max(1, plotBottom - plotTop);

  if (data.length === 0) {
    return {
      dataStatus: "no_data",
      width,
      height,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      domainMax: 60,
      totalMinutes: 0,
      totalActivities: 0,
      peakKey: null,
      ticks: [],
      bars: [],
      description: `${label}: nenhum dado registrado até o momento.`,
    };
  }

  const sanitized = data.map((item) => ({
    key: item.key,
    label: item.label,
    minutes: Math.max(0, safeFinite(item.minutes, 0)),
    activities: Math.max(0, Math.round(safeFinite(item.activities, 0))),
  }));

  const maxMinutes = Math.max(0, ...sanitized.map((item) => item.minutes));
  const totalMinutes = sanitized.reduce((sum, item) => sum + item.minutes, 0);
  const totalActivities = sanitized.reduce((sum, item) => sum + item.activities, 0);
  const dataStatus: ChartDataStatus = maxMinutes === 0 ? "zero_values" : "has_data";
  const domainMax = computeNiceDomainMax(maxMinutes);

  const peakItem =
    maxMinutes > 0
      ? sanitized.reduce((best, curr) => (curr.minutes > best.minutes ? curr : best), sanitized[0]!)
      : null;

  const tickCount = 4;
  const ticks: PeriodTick[] = Array.from({ length: tickCount + 1 }, (_, index) => {
    const ratio = index / tickCount;
    const value = Number((domainMax * ratio).toFixed(1));
    const y = Number((plotBottom - plotHeight * ratio).toFixed(2));
    return {
      value,
      y,
      label: formatMinutesShort(value),
    };
  });

  const slotWidth = plotWidth / sanitized.length;
  const barWidth = Math.max(10, Math.min(44, Number((slotWidth * 0.56).toFixed(2))));

  const bars: PeriodBarPoint[] = sanitized.map((item, index) => {
    const centerX = Number((plotLeft + slotWidth * index + slotWidth / 2).toFixed(2));
    const x = Number((centerX - barWidth / 2).toFixed(2));
    const rawHeight = item.minutes > 0 ? (item.minutes / domainMax) * plotHeight : 0;
    const barHeight =
      item.minutes > 0 ? Number(Math.max(4, Math.min(plotHeight, rawHeight)).toFixed(2)) : 0;
    const y = Number((plotBottom - barHeight).toFixed(2));
    const isPeak = Boolean(peakItem && item.key === peakItem.key && item.minutes > 0);
    const formattedValue = item.minutes > 0 ? formatMinutesShort(item.minutes) : "0";
    const accessibleLabel = `${item.label}: ${formatMinutesExact(item.minutes)}, ${item.activities} ${item.activities === 1 ? "atividade" : "atividades"}${isPeak ? " (pico do período)" : ""}`;

    return {
      key: item.key,
      label: item.label,
      minutes: item.minutes,
      activities: item.activities,
      isZero: item.minutes === 0,
      isPeak,
      x,
      y,
      width: barWidth,
      height: barHeight,
      centerX,
      formattedValue,
      accessibleLabel,
    };
  });

  const description =
    dataStatus === "zero_values"
      ? `${label}: ${sanitized.length} períodos analisados com 0 minutos registrados.`
      : `${label}: ${sanitized.length} períodos, total observado de ${formatMinutesExact(totalMinutes)} em ${totalActivities} atividades. Pico em ${peakItem?.label} com ${formatMinutesExact(peakItem?.minutes ?? 0)}.`;

  return {
    dataStatus,
    width,
    height,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    domainMax,
    totalMinutes: Number(totalMinutes.toFixed(1)),
    totalActivities,
    peakKey: peakItem?.key ?? null,
    ticks,
    bars,
    description,
  };
}

export interface BreakdownBarRow {
  readonly id: string;
  readonly label: string;
  readonly minutes: number;
  readonly percentage: number;
  readonly y: number;
  readonly barX: number;
  readonly barWidth: number;
  readonly trackWidth: number;
  readonly formattedValue: string;
  readonly accessibleLabel: string;
}

export interface BreakdownChartLayout {
  readonly dataStatus: ChartDataStatus;
  readonly width: number;
  readonly height: number;
  readonly rowHeight: number;
  readonly rows: readonly BreakdownBarRow[];
  readonly totalMinutes: number;
  readonly description: string;
}

export function computeBreakdownChartLayout(
  items: readonly AnalyticsBreakdown[],
  label: string,
  maxItems = 8,
): BreakdownChartLayout {
  const width = 460;
  const rowHeight = 40;
  const barX = 12;
  const trackWidth = width - 24;

  const sliced = items.slice(0, maxItems).map((item) => ({
    id: item.id,
    label: item.label,
    minutes: Math.max(0, safeFinite(item.minutes, 0)),
    percentage: clampPercent(item.percentage),
  }));

  if (sliced.length === 0) {
    return {
      dataStatus: "no_data",
      width,
      height: 60,
      rowHeight,
      rows: [],
      totalMinutes: 0,
      description: `${label}: nenhum dado registrado.`,
    };
  }

  const totalMinutes = sliced.reduce((sum, item) => sum + item.minutes, 0);
  const maxMinutes = Math.max(0, ...sliced.map((item) => item.minutes));
  const dataStatus: ChartDataStatus = maxMinutes === 0 ? "zero_values" : "has_data";

  const rows: BreakdownBarRow[] = sliced.map((item, index) => {
    const ratio = maxMinutes > 0 ? item.minutes / maxMinutes : 0;
    const barWidth =
      item.minutes > 0 ? Number(Math.max(4, Math.min(trackWidth, ratio * trackWidth)).toFixed(2)) : 0;
    const formattedValue = `${formatMinutesExact(item.minutes)} · ${item.percentage}%`;
    return {
      id: item.id,
      label: item.label,
      minutes: item.minutes,
      percentage: item.percentage,
      y: index * rowHeight + 8,
      barX,
      barWidth,
      trackWidth,
      formattedValue,
      accessibleLabel: `${item.label}: ${formatMinutesExact(item.minutes)} (${item.percentage}% do total observado)`,
    };
  });

  const height = Math.max(60, rows.length * rowHeight + 12);
  const description =
    dataStatus === "zero_values"
      ? `${label}: ${rows.length} itens listados com 0 minutos registrados.`
      : `${label}: ${rows.length} itens somando ${formatMinutesExact(totalMinutes)} observados. Principal: ${rows[0]?.label} (${rows[0]?.formattedValue}).`;

  return {
    dataStatus,
    width,
    height,
    rowHeight,
    rows,
    totalMinutes: Number(totalMinutes.toFixed(1)),
    description,
  };
}

export interface RetentionBarRow {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly evidence: number;
  readonly estimated: boolean;
  readonly y: number;
  readonly barX: number;
  readonly barWidth: number;
  readonly confidenceX: number;
  readonly trackWidth: number;
  readonly natureLabel: "Estimativa derivada" | "Indicador observado";
  readonly accessibleLabel: string;
}

export interface RetentionChartLayout {
  readonly dataStatus: ChartDataStatus;
  readonly width: number;
  readonly height: number;
  readonly rowHeight: number;
  readonly hasEstimated: boolean;
  readonly rows: readonly RetentionBarRow[];
  readonly description: string;
}

export function computeRetentionChartLayout(
  items: readonly RetentionMetric[],
  title: string,
  maxItems = 8,
): RetentionChartLayout {
  const width = 460;
  const rowHeight = 44;
  const barX = 12;
  const trackWidth = width - 24;

  const sliced = items.slice(0, maxItems).map((item) => ({
    id: item.id,
    label: item.label,
    value: clampPercent(item.value),
    evidence: clampPercent(item.evidence),
    estimated: Boolean(item.estimated),
  }));

  if (sliced.length === 0) {
    return {
      dataStatus: "no_data",
      width,
      height: 60,
      rowHeight,
      hasEstimated: false,
      rows: [],
      description: `${title}: ainda não há evidências suficientes.`,
    };
  }

  const hasEstimated = sliced.some((item) => item.estimated);
  const rows: RetentionBarRow[] = sliced.map((item, index) => {
    const barWidth =
      item.value > 0 ? Number(Math.max(4, Math.min(trackWidth, (item.value / 100) * trackWidth)).toFixed(2)) : 0;
    const confidenceX = Number((barX + (item.evidence / 100) * trackWidth).toFixed(2));
    const natureLabel = item.estimated ? "Estimativa derivada" : "Indicador observado";
    return {
      id: item.id,
      label: item.label,
      value: item.value,
      evidence: item.evidence,
      estimated: item.estimated,
      y: index * rowHeight + 8,
      barX,
      barWidth,
      confidenceX,
      trackWidth,
      natureLabel,
      accessibleLabel: `${item.label}: retenção ${item.value}%, confiança ${item.evidence}% (${natureLabel})`,
    };
  });

  const height = Math.max(60, rows.length * rowHeight + 12);
  const avg = Math.round(rows.reduce((sum, r) => sum + r.value, 0) / rows.length);
  const description = `${title}: ${rows.length} itens, retenção média de ${avg}%. ${hasEstimated ? "Inclui indicadores derivados/estimados." : "Calculado a partir das evidências registradas."}`;

  return {
    dataStatus: "has_data",
    width,
    height,
    rowHeight,
    hasEstimated,
    rows,
    description,
  };
}
