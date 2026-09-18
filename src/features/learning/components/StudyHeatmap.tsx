import type { LearningStatistics } from "../types";

export function StudyHeatmap({ statistics }: { statistics: LearningStatistics }) {
  const maximum = Math.max(1, ...statistics.heatmap.map((day) => day.minutes));
  return (
    <div>
      <div className="grid grid-cols-14 gap-1" aria-label="Calor de estudo dos últimos 28 dias">
        {statistics.heatmap.map((day) => {
          const intensity = day.minutes / maximum;
          return <span key={day.date} title={`${day.date}: ${day.minutes} min`} aria-label={`${day.date}: ${day.minutes} minutos`} className="aspect-square rounded-[3px] bg-primary" style={{ opacity: day.minutes === 0 ? 0.08 : Math.max(0.25, intensity) }} />;
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Últimos 28 dias</p>
    </div>
  );
}
