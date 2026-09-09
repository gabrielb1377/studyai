import { CalendarDays, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { weeklyProgress } from "./data";

export function WeeklyProgress() {
  const minutes = weeklyProgress.reduce((sum, day) => sum + day.minutes, 0);
  return (
    <section aria-labelledby="weekly-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="weekly-title" className="text-lg font-semibold tracking-tight">
          Seu progresso semanal
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />
          Semana de exemplo
        </span>
      </div>
      <Card className="grid gap-8 p-6 shadow-none sm:grid-cols-[1fr_1.4fr] sm:items-center sm:p-7">
        <div>
          <p className="text-xs text-muted-foreground">
            Tempo dedicado a aprender
          </p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {Math.floor(minutes / 60)}h{" "}
            <span className="text-2xl text-muted-foreground">
              {minutes % 60}min
            </span>
          </p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-primary">
            <TrendingUp className="size-3.5" />
            Um pouco a cada dia faz a diferença.
          </p>
        </div>
        <div
          className="flex h-32 items-end gap-3 sm:gap-5"
          role="img"
          aria-label={weeklyProgress
            .map((day) => `${day.day}: ${day.minutes} minutos`)
            .join("; ")}
        >
          {weeklyProgress.map((day) => (
            <div
              key={day.day}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2"
            >
              <span className="text-[10px] text-muted-foreground">
                {day.minutes > 0 ? `${day.minutes}m` : "—"}
              </span>
              <div
                className="w-full max-w-12 rounded-t-md bg-primary/25 transition-colors hover:bg-primary/50"
                style={{ height: `${Math.max((day.minutes / 55) * 72, 3)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">
                {day.day}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
