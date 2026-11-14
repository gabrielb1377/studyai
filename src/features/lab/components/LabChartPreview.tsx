"use client";

import { useState } from "react";
import { BarChart3, LineChart } from "lucide-react";
import type { LabChartSpec, LabMetricItem } from "../types";

export function LabChartPreview({
  chart,
  metrics,
}: {
  chart?: LabChartSpec;
  metrics?: readonly LabMetricItem[];
}) {
  const [kindOverride, setKindOverride] = useState<"line" | "bar" | undefined>(undefined);
  const effectiveKind = kindOverride ?? chart?.kind ?? "line";

  const width = 460;
  const height = 210;
  const padLeft = 44;
  const padRight = 16;
  const padTop = 18;
  const padBottom = 34;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const points = chart?.points ?? [];
  const ys = points.map((point) => point.y);
  const rawMin = ys.length ? Math.min(...ys) : 0;
  const rawMax = ys.length ? Math.max(...ys) : 1;
  const minVal = rawMin === rawMax ? rawMin - 1 : rawMin;
  const maxVal = rawMin === rawMax ? rawMax + 1 : rawMax;
  const range = maxVal - minVal || 1;

  const toY = (val: number) => padTop + plotHeight - ((val - minVal) / range) * plotHeight;
  const toX = (index: number) =>
    points.length <= 1
      ? padLeft + plotWidth / 2
      : padLeft + (index / (points.length - 1)) * plotWidth;

  const zeroY = minVal <= 0 && maxVal >= 0 ? toY(0) : toY(minVal);
  const polylinePoints = points.map((point, index) => `${toX(index).toFixed(1)},${toY(point.y).toFixed(1)}`).join(" ");
  const barSlot = points.length ? plotWidth / points.length : plotWidth;
  const barWidth = Math.max(6, Math.min(34, barSlot * 0.64));
  const labelStride = Math.max(1, Math.ceil(points.length / 6));

  return (
    <div className="space-y-3">
      {metrics?.length ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metrics.map((item) => (
            <div key={item.label} className="rounded-xl border bg-secondary/40 px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {chart && points.length > 0 ? (
        <div className="rounded-xl border bg-background p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">{chart.title || "Visualização gráfica"}</p>
            <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label="Tipo de gráfico">
              <button
                type="button"
                onClick={() => setKindOverride("line")}
                aria-pressed={effectiveKind === "line"}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  effectiveKind === "line" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LineChart className="size-3.5" />
                Linha
              </button>
              <button
                type="button"
                onClick={() => setKindOverride("bar")}
                aria-pressed={effectiveKind === "bar"}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                  effectiveKind === "bar" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="size-3.5" />
                Barras
              </button>
            </div>
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={chart.title ? `Gráfico de ${chart.title}` : "Gráfico gerado no Laboratório"}
            className="h-52 w-full overflow-visible text-foreground"
          >
            <title>{chart.title || "Gráfico de saída do Laboratório"}</title>
            <line x1={padLeft} y1={padTop} x2={padLeft} y2={padTop + plotHeight} stroke="currentColor" strokeOpacity={0.2} />
            <line x1={padLeft} y1={zeroY} x2={padLeft + plotWidth} y2={zeroY} stroke="currentColor" strokeOpacity={0.3} strokeDasharray={minVal < 0 && maxVal > 0 ? "4 3" : undefined} />

            <text x={padLeft - 6} y={padTop + 8} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.65}>
              {Number.isInteger(maxVal) ? maxVal : maxVal.toFixed(1)}
            </text>
            <text x={padLeft - 6} y={padTop + plotHeight} textAnchor="end" fontSize="10" fill="currentColor" opacity={0.65}>
              {Number.isInteger(minVal) ? minVal : minVal.toFixed(1)}
            </text>

            {effectiveKind === "bar" ? (
              points.map((point, index) => {
                const cx = padLeft + (index + 0.5) * barSlot;
                const yPoint = toY(point.y);
                const rectY = Math.min(yPoint, zeroY);
                const rectH = Math.max(2, Math.abs(zeroY - yPoint));
                return (
                  <g key={`${point.label}-${index}`}>
                    <rect
                      x={cx - barWidth / 2}
                      y={rectY}
                      width={barWidth}
                      height={rectH}
                      rx={3}
                      className="fill-primary/80"
                    >
                      <title>{`${point.label}: ${point.y}`}</title>
                    </rect>
                    {index % labelStride === 0 ? (
                      <text x={cx} y={height - 10} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.7}>
                        {point.label.slice(0, 8)}
                      </text>
                    ) : null}
                  </g>
                );
              })
            ) : (
              <>
                {points.length > 1 ? (
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.25}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    className="text-primary"
                    points={polylinePoints}
                  />
                ) : null}
                {points.map((point, index) => {
                  const cx = toX(index);
                  const cy = toY(point.y);
                  return (
                    <g key={`${point.label}-${index}`}>
                      <circle cx={cx} cy={cy} r={points.length > 35 ? 2.5 : 3.75} className="fill-primary">
                        <title>{`${point.label}: ${point.y}`}</title>
                      </circle>
                      {index % labelStride === 0 ? (
                        <text x={cx} y={height - 10} textAnchor="middle" fontSize="10" fill="currentColor" opacity={0.7}>
                          {point.label.slice(0, 8)}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </>
            )}
          </svg>
        </div>
      ) : null}
    </div>
  );
}
