"use client";

import { CalendarDays, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";

const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function WeeklyProgress() {
  const { records } = useStudyEngine();
  const weekStart = startOfWeek(new Date());
  const activity = days.map((day, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const next = new Date(date);
    next.setDate(date.getDate() + 1);
    const count = records.filter((record) => {
      const accessedAt = new Date(record.lastAccessedAt);
      return accessedAt >= date && accessedAt < next;
    }).length;
    return { day, count };
  });
  const total = activity.reduce((sum, item) => sum + item.count, 0);
  const maximum = Math.max(1, ...activity.map((item) => item.count));

  return (
    <section aria-labelledby="weekly-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <h2 id="weekly-title" className="text-lg font-semibold tracking-tight">Atividade semanal</h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" />Semana atual
        </span>
      </div>
      <Card className="grid gap-8 p-6 shadow-none sm:grid-cols-[1fr_1.4fr] sm:items-center sm:p-7">
        <div>
          <p className="text-xs text-muted-foreground">Temas acessados nesta semana</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight">{total}</p>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-primary">
            <TrendingUp className="size-3.5" />Atividade calculada a partir dos seus acessos reais.
          </p>
        </div>
        <div className="flex h-32 items-end gap-3 sm:gap-5" role="img" aria-label={activity.map((item) => `${item.day}: ${item.count} temas`).join("; ")}>
          {activity.map((item) => (
            <div key={item.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <span className="text-[10px] text-muted-foreground">{item.count || "—"}</span>
              <div className="w-full max-w-12 rounded-t-md bg-primary/25 transition-colors hover:bg-primary/50" style={{ height: `${Math.max((item.count / maximum) * 72, 3)}px` }} />
              <span className="text-[10px] text-muted-foreground">{item.day}</span>
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
