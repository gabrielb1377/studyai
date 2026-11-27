import type { AnalyticsBreakdown, AnalyticsPeriodPoint, ForgettingMetric, RetentionMetric } from "../types";
import {
  PerformanceBreakdownSvgChart,
  PerformancePeriodSvgChart,
  PerformanceRetentionSvgChart,
} from "./PerformanceSvgCharts";

export function PeriodChart({ data, label }: { data: readonly AnalyticsPeriodPoint[]; label: string }) {
  return <PerformancePeriodSvgChart data={data} label={label} />;
}

export function BreakdownList({
  items,
  emptyMessage,
  label = "Distribuição de tempo",
}: {
  items: readonly AnalyticsBreakdown[];
  emptyMessage: string;
  label?: string;
}) {
  return <PerformanceBreakdownSvgChart items={items} label={label} emptyMessage={emptyMessage} />;
}

export function RetentionList({ items, title }: { items: readonly RetentionMetric[]; title: string }) {
  return <PerformanceRetentionSvgChart items={items} title={title} />;
}

const forgettingLabels = { forgetting: "Esquecendo", stable: "Estável", mastered: "Dominado" };
const forgettingStyles = {
  forgetting: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
  stable: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  mastered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
};

export function ForgettingList({ items }: { items: readonly ForgettingMetric[] }) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        Estude um tema para calcular a curva de esquecimento.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item) => (
        <div key={item.studyId} className="flex items-center gap-3 rounded-xl border p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.topic}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.subject}
              {item.daysSinceActivity !== undefined
                ? ` · ${item.daysSinceActivity} dias sem atividade`
                : " · sem atividade registrada"}
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-[11px] font-medium ${forgettingStyles[item.status]}`}>
            {forgettingLabels[item.status]}
          </span>
          <strong className="w-10 text-right text-sm tabular-nums">{item.retention}%</strong>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsHeatmap({
  days,
}: {
  days: readonly { date: string; minutes: number; activities: number; intensity: number }[];
}) {
  return (
    <div>
      <div
        className="grid grid-cols-14 gap-1"
        role="img"
        aria-label={`Mapa de calor dos últimos ${days.length} dias`}
      >
        {days.map((day) => (
          <span
            key={day.date}
            className="aspect-square rounded-[3px] bg-primary"
            style={{ opacity: day.intensity || 0.07 }}
            title={`${day.date}: ${day.minutes} min, ${day.activities} atividades`}
            aria-label={`${day.date}: ${day.minutes} minutos em ${day.activities} atividades`}
          />
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Menos</span>
        <span>84 dias · intensidade por minutos registrados</span>
        <span>Mais</span>
      </div>
    </div>
  );
}
