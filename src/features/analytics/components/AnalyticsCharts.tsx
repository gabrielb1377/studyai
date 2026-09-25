import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { AnalyticsBreakdown, AnalyticsPeriodPoint, ForgettingMetric, RetentionMetric } from "../types";

export function PeriodChart({ data, label }: { data: readonly AnalyticsPeriodPoint[]; label: string }) {
  const maximum = Math.max(1, ...data.map((item) => item.minutes));
  return (
    <div className="space-y-3">
      <div className="flex h-40 items-end gap-2" role="img" aria-label={`${label}: ${data.map((item) => `${item.label}, ${Math.round(item.minutes)} minutos`).join("; ")}`}>
        {data.map((item) => (
          <div key={item.key} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            <span className="text-[10px] tabular-nums text-muted-foreground">{item.minutes ? `${Math.round(item.minutes)}m` : "—"}</span>
            <span className="w-full max-w-12 rounded-t-lg bg-primary/80 transition-[height,opacity] duration-300 hover:bg-primary" style={{ height: `${Math.max(3, item.minutes / maximum * 108)}px`, opacity: item.minutes ? 1 : 0.12 }} />
            <span className="truncate text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BreakdownList({ items, emptyMessage }: { items: readonly AnalyticsBreakdown[]; emptyMessage: string }) {
  if (items.length === 0) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <div className="space-y-3">
      {items.slice(0, 8).map((item) => (
        <div key={item.id}>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium">{item.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{Math.round(item.minutes)} min · {item.percentage}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.percentage}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

export function RetentionList({ items, title }: { items: readonly RetentionMetric[]; title: string }) {
  return (
    <Card className="gap-4 p-4 shadow-none">
      <div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{title}</h3>{items.some((item) => item.estimated) && <Badge variant="outline">Estimativa</Badge>}</div>
      {items.length === 0 ? <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Ainda não há evidências suficientes.</p> : (
        <div className="space-y-3">{items.slice(0, 8).map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3"><div><div className="mb-1 flex justify-between gap-2 text-xs"><span className="truncate">{item.label}</span><span className="text-muted-foreground">conf. {item.evidence}%</span></div><div className="h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${item.value}%` }}/></div></div><strong className="text-right text-sm tabular-nums">{item.value}%</strong></div>)}</div>
      )}
    </Card>
  );
}

const forgettingLabels = { forgetting: "Esquecendo", stable: "Estável", mastered: "Dominado" };
const forgettingStyles = { forgetting: "bg-amber-500/12 text-amber-700 dark:text-amber-300", stable: "bg-sky-500/12 text-sky-700 dark:text-sky-300", mastered: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };

export function ForgettingList({ items }: { items: readonly ForgettingMetric[] }) {
  if (items.length === 0) return <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Estude um tema para calcular a curva de esquecimento.</p>;
  return <div className="space-y-2">{items.slice(0, 10).map((item) => <div key={item.studyId} className="flex items-center gap-3 rounded-xl border p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.topic}</p><p className="truncate text-xs text-muted-foreground">{item.subject}{item.daysSinceActivity !== undefined ? ` · ${item.daysSinceActivity} dias sem atividade` : " · sem atividade registrada"}</p></div><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${forgettingStyles[item.status]}`}>{forgettingLabels[item.status]}</span><strong className="w-10 text-right text-sm tabular-nums">{item.retention}%</strong></div>)}</div>;
}

export function AnalyticsHeatmap({ days }: { days: readonly { date: string; minutes: number; activities: number; intensity: number }[] }) {
  return (
    <div>
      <div className="grid grid-cols-14 gap-1" role="img" aria-label={`Mapa de calor dos últimos ${days.length} dias`}>
        {days.map((day) => <span key={day.date} className="aspect-square rounded-[3px] bg-primary" style={{ opacity: day.intensity || 0.07 }} title={`${day.date}: ${day.minutes} min, ${day.activities} atividades`} aria-label={`${day.date}: ${day.minutes} minutos em ${day.activities} atividades`} />)}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground"><span>Menos</span><span>84 dias · intensidade por minutos registrados</span><span>Mais</span></div>
    </div>
  );
}

