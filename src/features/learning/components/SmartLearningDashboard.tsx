"use client";

import Link from "next/link";
import { BrainCircuit, CalendarCheck2, Clock3, Flame, Gauge, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyRecord } from "@/types/study-engine";
import { ReviewScheduler } from "../ReviewScheduler";
import { useLearningEngine } from "../hooks/useLearningEngine";
import { KnowledgeCard } from "./KnowledgeCard";
import { StudyHeatmap } from "./StudyHeatmap";
import { useKnowledgeGraphs } from "@/features/semantic/useKnowledgeGraphs";
import { LearningKnowledgeBridge } from "@/features/semantic/LearningKnowledgeBridge";

export function SmartLearningDashboard({ studies, flashcards, quizzes }: {
  studies: readonly StudyRecord[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
}) {
  const { profile, knowledge, priorities, dailyPlan, statistics } = useLearningEngine(studies, flashcards, quizzes);
  const { graphs } = useKnowledgeGraphs();
  if (studies.length === 0) return null;
  const dueReviews = flashcards.filter((card) => ReviewScheduler.isDue(card)).length;
  const hardest = knowledge.filter((score) => score.classification !== "never_studied").sort((left, right) => left.knowledge - right.knowledge)[0];
  const strongest = [...knowledge].sort((left, right) => right.knowledge - left.knowledge)[0];
  const latestStudy = [...studies].sort((left, right) => right.lastAccessedAt.localeCompare(left.lastAccessedAt))[0];
  const summary = [
    { label: "Próximas revisões", value: dueReviews, icon: RotateCcw },
    { label: "Tempo estudado", value: `${Math.round(profile.totalStudyMinutes)} min`, icon: Clock3 },
    { label: "Maior dificuldade", value: hardest?.topic ?? "—", icon: BrainCircuit },
    { label: "Maior progresso", value: strongest ? `${strongest.topic} · ${strongest.knowledge}%` : "—", icon: Gauge },
    { label: "Último estudo", value: latestStudy?.title ?? "—", icon: CalendarCheck2 },
    { label: "Streak", value: `${profile.streak} ${profile.streak === 1 ? "dia" : "dias"}`, icon: Flame },
  ];
  const prerequisites = LearningKnowledgeBridge.recommend(graphs, knowledge);

  return (
    <section aria-labelledby="learning-dashboard-title" className="space-y-4">
      <div><h2 id="learning-dashboard-title" className="text-lg font-semibold tracking-tight">Hoje</h2><p className="mt-1 text-sm text-muted-foreground">Seu plano e os sinais reais da sua aprendizagem.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {summary.map(({ label, value, icon: Icon }) => <Card key={label} className="gap-2 p-4 shadow-none"><Icon className="size-4 text-primary" /><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-sm font-semibold" title={String(value)}>{value}</p></Card>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 p-4 shadow-none">
          <div className="flex items-center justify-between"><div><h3 className="font-semibold">Plano diário</h3><p className="text-xs text-muted-foreground">Gerado automaticamente por prioridade.</p></div><Badge variant="secondary">{dailyPlan.filter((item) => item.completed).length}/{dailyPlan.length}</Badge></div>
          <div className="space-y-2">{dailyPlan.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-lg border p-3"><span className={`flex size-5 items-center justify-center rounded-full border text-xs ${item.completed ? "border-primary bg-primary text-primary-foreground" : ""}`}>{item.completed ? "✓" : ""}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.description}</p></div><Badge variant="outline">{item.priority}</Badge><Button asChild variant="ghost" size="sm"><Link href={`/estudo?studyId=${encodeURIComponent(item.studyId)}`}>Abrir</Link></Button></div>)}{dailyPlan.length === 0 && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">Estude um tema para receber um plano diário personalizado.</p>}</div>
        </Card>
        <Card className="gap-4 p-4 shadow-none"><div><h3 className="font-semibold">Estatísticas</h3><p className="text-xs text-muted-foreground">{statistics.activeDays} dias ativos · horário {statistics.preferredHour}</p></div><StudyHeatmap statistics={statistics} /><div className="grid grid-cols-2 gap-3 text-sm"><p><strong>{statistics.averageSessionMinutes} min</strong><br /><span className="text-xs text-muted-foreground">Tempo médio</span></p><p><strong>{statistics.averageQuizScore}%</strong><br /><span className="text-xs text-muted-foreground">Quiz médio</span></p><p><strong>{statistics.flashcardsAnswered}</strong><br /><span className="text-xs text-muted-foreground">Flashcards</span></p><p><strong>{statistics.retention}%</strong><br /><span className="text-xs text-muted-foreground">Retenção</span></p></div></Card>
      </div>
      {knowledge.length > 0 && <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{knowledge.slice().sort((left, right) => priorities.findIndex((priority) => priority.studyId === left.studyId) - priorities.findIndex((priority) => priority.studyId === right.studyId)).slice(0, 3).map((score) => <KnowledgeCard key={score.studyId} score={score} priority={priorities.find((priority) => priority.studyId === score.studyId)!} />)}</div>}
      {prerequisites.length > 0 && <Card className="gap-3 p-4 shadow-none"><div><h3 className="font-semibold">Pré-requisitos recomendados</h3><p className="text-xs text-muted-foreground">Sugestões baseadas nas dependências do mapa de conhecimento.</p></div><div className="grid gap-2 md:grid-cols-3">{prerequisites.map((item) => <Link key={`${item.studyId}-${item.concept}-${item.prerequisite}`} href={`/estudo?studyId=${encodeURIComponent(item.studyId)}&aba=knowledge`} className="rounded-lg border p-3 text-sm transition-colors hover:bg-accent"><strong>{item.prerequisite}</strong><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.reason}</p></Link>)}</div></Card>}
    </section>
  );
}
