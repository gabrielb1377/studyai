"use client";

import { useState } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MentorGoal, MentorGoalType } from "../types";

const labels: Record<MentorGoalType, string> = { exam: "Prova", assignment: "Trabalho", review: "Revisão", time: "Tempo de estudo" };

export function MentorGoals({ studyId, goals, disabled, onCreate, onUpdate, onRemove }: {
  studyId: string;
  goals: readonly MentorGoal[];
  disabled?: boolean;
  onCreate: (input: { title: string; type: MentorGoalType; studyId?: string; targetAt?: string; targetMinutes?: number }) => void;
  onUpdate: (id: string, changes: Partial<MentorGoal>) => void;
  onRemove: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MentorGoalType>("exam");
  const [targetAt, setTargetAt] = useState("");
  const [targetMinutes, setTargetMinutes] = useState("120");
  const add = () => {
    if (!title.trim()) return;
    onCreate({ title, type, studyId, targetAt: targetAt ? new Date(`${targetAt}T12:00:00`).toISOString() : undefined, targetMinutes: type === "time" ? Math.max(1, Number(targetMinutes) || 1) : undefined });
    setTitle(""); setTargetAt("");
  };
  return (
    <section aria-labelledby="mentor-goals-title" className="space-y-3">
      <div><h3 id="mentor-goals-title" className="text-sm font-semibold">Objetivos</h3><p className="text-xs text-muted-foreground">O plano considera suas metas ativas.</p></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1fr_8rem_9rem_8rem_auto]">
        <Input aria-label="Nova meta" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: prova de algoritmos" />
        <select aria-label="Tipo da meta" value={type} onChange={(event) => setType(event.target.value as MentorGoalType)} className="h-9 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <Input aria-label="Prazo da meta" type="date" value={targetAt} onChange={(event) => setTargetAt(event.target.value)} />
        <Input aria-label="Minutos da meta" type="number" min={1} value={targetMinutes} onChange={(event) => setTargetMinutes(event.target.value)} disabled={type !== "time"} />
        <Button type="button" size="sm" className="h-9" onClick={add} disabled={disabled || !title.trim()}><Plus />Adicionar</Button>
      </div>
      {goals.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">Nenhuma meta para este tema.</p> : <ul className="space-y-2">{goals.map((goal) => <li key={goal.id} className="flex items-center gap-3 rounded-lg border p-3">
        <button type="button" aria-label={goal.status === "completed" ? `Reabrir meta ${goal.title}` : `Concluir meta ${goal.title}`} onClick={() => onUpdate(goal.id, { status: goal.status === "completed" ? "active" : "completed", progress: goal.status === "completed" ? goal.progress : 100 })} className={goal.status === "completed" ? "text-emerald-500" : "text-muted-foreground hover:text-primary"}><CheckCircle2 className="size-5" /></button>
        <span className="min-w-0 flex-1"><span className={`block truncate text-sm font-medium ${goal.status === "completed" ? "line-through opacity-60" : ""}`}>{goal.title}</span><span className="text-xs text-muted-foreground">{labels[goal.type]} · {goal.progress}%{goal.targetMinutes ? ` · ${goal.targetMinutes} min` : ""}{goal.targetAt ? ` · até ${new Date(goal.targetAt).toLocaleDateString("pt-BR")}` : ""}</span></span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Excluir meta ${goal.title}`} onClick={() => onRemove(goal.id)}><Trash2 /></Button>
      </li>)}</ul>}
    </section>
  );
}
