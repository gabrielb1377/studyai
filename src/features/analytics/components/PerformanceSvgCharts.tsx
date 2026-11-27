"use client";

/**
 * StudyAI — MM-1: Componentes SVG acessíveis de desempenho com tabela equivalente.
 *
 * - Zero bibliotecas externas de gráficos.
 * - Reutiliza exclusivamente dados produzidos por `AnalyticsEngine`.
 * - Navegação completa por teclado (setas, Home, End, Enter/Space) apenas nos pontos de dados
 *   (elementos decorativos possuem `aria-hidden="true"`).
 * - Tabela semântica equivalente (`<table>`, `<caption>`, `<th scope="col">`) sempre disponível
 *   para leitores de tela e expansível visualmente por teclado.
 * - Informação nunca depende exclusivamente de cor (valores textuais, traçados e marcadores).
 * - Respeita tokens de tema claro/escuro e `motion-reduce:transition-none`.
 */

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  computeBreakdownChartLayout,
  computePeriodChartLayout,
  computeRetentionChartLayout,
  formatMinutesExact,
  formatPercent,
} from "../charts/chartScale";
import type { AnalyticsBreakdown, AnalyticsPeriodPoint, RetentionMetric } from "../types";

function truncateLabel(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1)}…`;
}

function moveRovingIndex(key: string, current: number, length: number): number | null {
  if (length <= 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (current + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (current - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

export function PerformancePeriodSvgChart({
  data,
  label,
}: {
  readonly data: readonly AnalyticsPeriodPoint[];
  readonly label: string;
}) {
  const uid = useId();
  const [selectedIndex, setSelectedIndex] = useState<number>(() => Math.max(0, data.length - 1));
  const [showTable, setShowTable] = useState(false);
  const pointRefs = useRef<Array<SVGGElement | null>>([]);

  const layout = computePeriodChartLayout(data, label);
  const safeIndex =
    layout.bars.length > 0 ? Math.min(Math.max(0, selectedIndex), layout.bars.length - 1) : -1;
  const activePoint = safeIndex >= 0 ? layout.bars[safeIndex] : undefined;

  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const tableId = `${uid}-table`;

  const handlePointKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const next = moveRovingIndex(event.key, index, layout.bars.length);
    if (next !== null) {
      event.preventDefault();
      setSelectedIndex(next);
      pointRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
    }
  };

  if (layout.dataStatus === "no_data") {
    return (
      <div className="space-y-3" data-chart-status="no_data">
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Ainda não há períodos registrados para {label.toLowerCase()}.
        </p>
      </div>
    );
  }

  return (
    <div className="relative min-w-0 space-y-3" data-chart-status={layout.dataStatus}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-[11px] font-normal">
            Observado
          </Badge>
          {layout.dataStatus === "zero_values" ? (
            <span className="text-muted-foreground">0 min registrados no intervalo</span>
          ) : activePoint ? (
            <span aria-live="polite" className="font-medium text-foreground tabular-nums">
              {activePoint.label}: {formatMinutesExact(activePoint.minutes)} · {activePoint.activities}{" "}
              {activePoint.activities === 1 ? "atividade" : "atividades"}
              {activePoint.isPeak ? " (pico)" : ""}
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
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
          <title id={titleId}>Gráfico: {label}</title>
          <desc id={descId}>{layout.description}</desc>

          {/* Grade e eixo Y decorativos (não focáveis) */}
          <g aria-hidden="true">
            {layout.ticks.map((tick) => (
              <g key={tick.value}>
                <line
                  x1={layout.plotLeft}
                  y1={tick.y}
                  x2={layout.plotRight}
                  y2={tick.y}
                  className="stroke-border"
                  strokeWidth={tick.value === 0 ? 1.25 : 0.75}
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

          {/* Pontos interativos acessíveis por teclado */}
          <g role="group" aria-label={`Pontos de dados de ${label}`}>
            {layout.bars.map((bar, index) => {
              const isSelected = index === safeIndex;
              return (
                <g
                  key={bar.key}
                  ref={(el) => {
                    pointRefs.current[index] = el;
                  }}
                  role="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={bar.accessibleLabel}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onKeyDown={(event) => handlePointKeyDown(event, index)}
                  className="cursor-pointer outline-none focus-visible:[&_.chart-focus-ring]:stroke-ring"
                >
                  {/* Área clicável/focável limpa com anel de foco visível */}
                  <rect
                    x={Number((bar.x - 4).toFixed(2))}
                    y={layout.plotTop - 16}
                    width={Number((bar.width + 8).toFixed(2))}
                    height={Number((layout.plotBottom - layout.plotTop + 44).toFixed(2))}
                    rx={6}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={2}
                    className="chart-focus-ring"
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
                      rx={5}
                      className={
                        isSelected
                          ? "fill-primary motion-reduce:transition-none transition-opacity"
                          : "fill-primary/75 hover:fill-primary motion-reduce:transition-none transition-opacity"
                      }
                      stroke={bar.isPeak || isSelected ? "currentColor" : "none"}
                      strokeWidth={bar.isPeak || isSelected ? 1.25 : 0}
                    />
                  )}

                  {/* Marcador não dependente de cor para o pico do período */}
                  {bar.isPeak && !bar.isZero ? (
                    <polygon
                      aria-hidden="true"
                      points={`${bar.centerX},${Number((bar.y - 12).toFixed(2))} ${Number((bar.centerX + 4).toFixed(2))},${Number((bar.y - 8).toFixed(2))} ${bar.centerX},${Number((bar.y - 4).toFixed(2))} ${Number((bar.centerX - 4).toFixed(2))},${Number((bar.y - 8).toFixed(2))}`}
                      className="fill-primary"
                    />
                  ) : null}

                  <text
                    aria-hidden="true"
                    x={bar.centerX}
                    y={Number((bar.isZero ? layout.plotBottom - 7 : Math.max(12, bar.y - (bar.isPeak ? 16 : 6))).toFixed(2))}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[10px] font-medium tabular-nums"
                  >
                    {bar.isZero ? "0" : bar.formattedValue}
                  </text>

                  <text
                    aria-hidden="true"
                    x={bar.centerX}
                    y={layout.plotBottom + 16}
                    textAnchor="middle"
                    className={
                      isSelected
                        ? "fill-foreground text-[10px] font-semibold"
                        : "fill-muted-foreground text-[10px]"
                    }
                  >
                    {truncateLabel(bar.label, 8)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      {/* Tabela semântica equivalente: sempre acessível para leitores de tela e expansível visualmente */}
      <div
        id={tableId}
        className={showTable ? "overflow-x-auto rounded-lg border" : "sr-only left-0 top-0"}
      >
        <table
          aria-label={`Tabela equivalente: ${label}`}
          className="w-full border-collapse text-left text-xs"
        >
          <caption className="sr-only">
            Tabela equivalente de dados para {label} (métricas observadas).
          </caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Período</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tempo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Atividades</th>
              <th scope="col" className="px-3 py-2 font-medium">Natureza</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {layout.bars.map((bar) => (
              <tr key={bar.key}>
                <th scope="row" className="px-3 py-1.5 font-medium text-foreground">
                  {bar.label}
                  {bar.isPeak ? " (pico)" : ""}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatMinutesExact(bar.minutes)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{bar.activities}</td>
                <td className="px-3 py-1.5 text-muted-foreground">
                  {bar.isZero ? "Valor zero" : "Observado"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PerformanceBreakdownSvgChart({
  items,
  label,
  emptyMessage,
}: {
  readonly items: readonly AnalyticsBreakdown[];
  readonly label: string;
  readonly emptyMessage: string;
}) {
  const uid = useId();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const rowRefs = useRef<Array<SVGGElement | null>>([]);

  const layout = computeBreakdownChartLayout(items, label);
  const safeIndex =
    layout.rows.length > 0 ? Math.min(Math.max(0, selectedIndex), layout.rows.length - 1) : -1;
  const activeRow = safeIndex >= 0 ? layout.rows[safeIndex] : undefined;

  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const tableId = `${uid}-table`;

  if (layout.dataStatus === "no_data") {
    return (
      <p
        data-chart-status="no_data"
        className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground"
      >
        {emptyMessage}
      </p>
    );
  }

  const handleRowKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const next = moveRovingIndex(event.key, index, layout.rows.length);
    if (next !== null) {
      event.preventDefault();
      setSelectedIndex(next);
      rowRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
    }
  };

  return (
    <div className="relative min-w-0 space-y-3" data-chart-status={layout.dataStatus}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span aria-live="polite" className="truncate text-muted-foreground tabular-nums">
          {activeRow ? `${activeRow.label}: ${activeRow.formattedValue}` : "Observado"}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
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
          <title id={titleId}>Gráfico: {label}</title>
          <desc id={descId}>{layout.description}</desc>
          <g role="group" aria-label={`Barras de ${label}`}>
            {layout.rows.map((row, index) => {
              const isSelected = index === safeIndex;
              return (
                <g
                  key={row.id}
                  ref={(el) => {
                    rowRefs.current[index] = el;
                  }}
                  role="button"
                  tabIndex={isSelected ? 0 : -1}
                  aria-label={row.accessibleLabel}
                  aria-pressed={isSelected}
                  onClick={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onKeyDown={(event) => handleRowKeyDown(event, index)}
                  className="cursor-pointer outline-none focus-visible:[&_.chart-focus-ring]:stroke-ring"
                >
                  <rect
                    x={4}
                    y={row.y - 4}
                    width={layout.width - 8}
                    height={layout.rowHeight - 2}
                    rx={6}
                    fill="transparent"
                    stroke="transparent"
                    strokeWidth={2}
                    className="chart-focus-ring"
                  />
                  <text
                    aria-hidden="true"
                    x={row.barX}
                    y={row.y + 10}
                    className="fill-foreground text-[11px] font-medium"
                  >
                    {truncateLabel(row.label, 34)}
                  </text>
                  <text
                    aria-hidden="true"
                    x={row.barX + row.trackWidth}
                    y={row.y + 10}
                    textAnchor="end"
                    className="fill-muted-foreground text-[11px] tabular-nums"
                  >
                    {row.formattedValue}
                  </text>
                  <rect
                    aria-hidden="true"
                    x={row.barX}
                    y={row.y + 17}
                    width={row.trackWidth}
                    height={8}
                    rx={4}
                    className="fill-muted"
                  />
                  {row.barWidth > 0 ? (
                    <rect
                      aria-hidden="true"
                      x={row.barX}
                      y={row.y + 17}
                      width={row.barWidth}
                      height={8}
                      rx={4}
                      className={
                        isSelected
                          ? "fill-primary motion-reduce:transition-none"
                          : "fill-primary/80 motion-reduce:transition-none"
                      }
                      stroke={isSelected ? "currentColor" : "none"}
                      strokeWidth={isSelected ? 1 : 0}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div
        id={tableId}
        className={showTable ? "overflow-x-auto rounded-lg border" : "sr-only left-0 top-0"}
      >
        <table
          aria-label={`Tabela equivalente: ${label}`}
          className="w-full border-collapse text-left text-xs"
        >
          <caption className="sr-only">Tabela equivalente para {label}.</caption>
          <thead className="border-b bg-muted/40 text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Item</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Tempo</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Participação</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {layout.rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="px-3 py-1.5 font-medium text-foreground">
                  {row.label}
                </th>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatMinutesExact(row.minutes)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {formatPercent(row.percentage)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PerformanceRetentionSvgChart({
  items,
  title,
}: {
  readonly items: readonly RetentionMetric[];
  readonly title: string;
}) {
  const uid = useId();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showTable, setShowTable] = useState(false);
  const rowRefs = useRef<Array<SVGGElement | null>>([]);

  const layout = computeRetentionChartLayout(items, title);
  const safeIndex =
    layout.rows.length > 0 ? Math.min(Math.max(0, selectedIndex), layout.rows.length - 1) : -1;
  const activeRow = safeIndex >= 0 ? layout.rows[safeIndex] : undefined;

  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const tableId = `${uid}-table`;

  const handleRowKeyDown = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const next = moveRovingIndex(event.key, index, layout.rows.length);
    if (next !== null) {
      event.preventDefault();
      setSelectedIndex(next);
      rowRefs.current[next]?.focus();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedIndex(index);
    }
  };

  return (
    <Card className="relative min-w-0 gap-4 p-4 shadow-none" data-chart-status={layout.dataStatus}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{title}</h3>
          {layout.hasEstimated ? (
            <Badge variant="outline">Estimativa</Badge>
          ) : layout.rows.length > 0 ? (
            <Badge variant="secondary" className="text-[11px] font-normal">
              Observado
            </Badge>
          ) : null}
        </div>
        {layout.rows.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            aria-expanded={showTable}
            aria-controls={tableId}
            onClick={() => setShowTable((prev) => !prev)}
          >
            <Table2 className="mr-1 size-3.5" aria-hidden="true" />
            {showTable ? "Ocultar tabela" : "Ver tabela"}
          </Button>
        ) : null}
      </div>

      {layout.dataStatus === "no_data" ? (
        <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
          Ainda não há evidências suficientes.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>Barra = Retenção (%) · Losango (◆) = Confiança (%)</span>
            {activeRow ? (
              <span aria-live="polite" className="font-medium text-foreground tabular-nums">
                {activeRow.label}: {activeRow.value}% (conf. {activeRow.evidence}%)
              </span>
            ) : null}
          </div>

          <div className="w-full min-w-0 overflow-hidden">
            <svg
              viewBox={`0 0 ${layout.width} ${layout.height}`}
              role="img"
              aria-labelledby={titleId}
              aria-describedby={descId}
              className="block h-auto w-full max-w-full select-none text-foreground"
            >
              <title id={titleId}>Retenção {title}</title>
              <desc id={descId}>{layout.description}</desc>
              <g role="group" aria-label={`Indicadores de retenção ${title}`}>
                {layout.rows.map((row, index) => {
                  const isSelected = index === safeIndex;
                  const cy = row.y + 23;
                  return (
                    <g
                      key={row.id}
                      ref={(el) => {
                        rowRefs.current[index] = el;
                      }}
                      role="button"
                      tabIndex={isSelected ? 0 : -1}
                      aria-label={row.accessibleLabel}
                      aria-pressed={isSelected}
                      onClick={() => setSelectedIndex(index)}
                      onFocus={() => setSelectedIndex(index)}
                      onKeyDown={(event) => handleRowKeyDown(event, index)}
                      className="cursor-pointer outline-none focus-visible:[&_.chart-focus-ring]:stroke-ring"
                    >
                      <rect
                        x={4}
                        y={row.y - 4}
                        width={layout.width - 8}
                        height={layout.rowHeight - 2}
                        rx={6}
                        fill="transparent"
                        stroke="transparent"
                        strokeWidth={2}
                        className="chart-focus-ring"
                      />
                      <text
                        aria-hidden="true"
                        x={row.barX}
                        y={row.y + 11}
                        className="fill-foreground text-[11px] font-medium"
                      >
                        {truncateLabel(row.label, 30)}
                      </text>
                      <text
                        aria-hidden="true"
                        x={row.barX + row.trackWidth}
                        y={row.y + 11}
                        textAnchor="end"
                        className="fill-muted-foreground text-[11px] tabular-nums"
                      >
                        {row.value}% · conf. {row.evidence}%
                      </text>
                      <rect
                        aria-hidden="true"
                        x={row.barX}
                        y={row.y + 19}
                        width={row.trackWidth}
                        height={8}
                        rx={4}
                        className="fill-muted"
                      />
                      {row.barWidth > 0 ? (
                        <rect
                          aria-hidden="true"
                          x={row.barX}
                          y={row.y + 19}
                          width={row.barWidth}
                          height={8}
                          rx={4}
                          className={
                            row.estimated
                              ? "fill-primary/65 motion-reduce:transition-none"
                              : "fill-primary motion-reduce:transition-none"
                          }
                          stroke={row.estimated ? "currentColor" : "none"}
                          strokeDasharray={row.estimated ? "3 2" : undefined}
                          strokeWidth={row.estimated ? 1 : 0}
                        />
                      ) : null}
                      {/* Marcador geométrico de confiança/incerteza */}
                      <polygon
                        aria-hidden="true"
                        points={`${row.confidenceX},${cy - 5} ${row.confidenceX + 5},${cy} ${row.confidenceX},${cy + 5} ${row.confidenceX - 5},${cy}`}
                        className="fill-card stroke-foreground"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div
            id={tableId}
            className={showTable ? "overflow-x-auto rounded-lg border" : "sr-only left-0 top-0"}
          >
            <table
              aria-label={`Tabela equivalente: Retenção ${title}`}
              className="w-full border-collapse text-left text-xs"
            >
              <caption className="sr-only">
                Tabela equivalente de retenção e confiança ({title}).
              </caption>
              <thead className="border-b bg-muted/40 text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">Item</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Retenção</th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">Confiança</th>
                  <th scope="col" className="px-3 py-2 font-medium">Natureza</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {layout.rows.map((row) => (
                  <tr key={row.id}>
                    <th scope="row" className="px-3 py-1.5 font-medium text-foreground">
                      {row.label}
                    </th>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatPercent(row.value)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {formatPercent(row.evidence)}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{row.natureLabel}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
