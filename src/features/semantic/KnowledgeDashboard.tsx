"use client";

import { BrainCircuit, GitFork, GraduationCap, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { StudyRecord } from "@/types/study-engine";
import { useKnowledgeGraphs } from "./useKnowledgeGraphs";

export function KnowledgeDashboard({ studies }: { studies: readonly StudyRecord[] }) {
  const { graphs, isLoading } = useKnowledgeGraphs();
  if (isLoading || graphs.length === 0) return null;
  const concepts = graphs.flatMap((graph) => graph.concepts);
  const studiesById = new Map(studies.map((study) => [study.studyId, study]));
  const learned = concepts.filter((concept) => (studiesById.get(concept.studyId)?.progress ?? 0) > 0).length;
  const mastered = concepts.filter((concept) => (studiesById.get(concept.studyId)?.progress ?? 0) >= 80).length;
  const forgotten = concepts.filter((concept) => {
    const study = studiesById.get(concept.studyId);
    return Boolean(study && study.progress > 0 && Date.now() - new Date(study.lastAccessedAt).getTime() > 14 * 86_400_000);
  }).length;
  const relations = graphs.reduce((total, graph) => total + graph.relations.length, 0);
  const progress = studies.length ? Math.round(studies.reduce((total, study) => total + study.progress, 0) / studies.length) : 0;
  const stats = [
    { label: "Conceitos aprendidos", value: learned, icon: BrainCircuit },
    { label: "Conceitos dominados", value: mastered, icon: GraduationCap },
    { label: "Precisam de revisão", value: forgotten, icon: RotateCcw },
    { label: "Relações no mapa", value: relations, icon: GitFork },
  ];
  return <section aria-labelledby="knowledge-dashboard-title" className="space-y-3"><div><h2 id="knowledge-dashboard-title" className="text-lg font-semibold">Conhecimento estruturado</h2><p className="mt-1 text-sm text-muted-foreground">Evolução do seu mapa semântico · {progress}% de progresso médio.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <Card key={label} className="gap-2 p-4 shadow-none"><Icon className="size-4 text-primary" /><p className="text-2xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></Card>)}</div></section>;
}
