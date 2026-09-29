"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, BrainCircuit, CalendarClock, FlaskConical, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AcademyStorage, ACADEMY_UPDATED_EVENT } from "@/features/academy/storage/AcademyStorage";
import type { AcademyStudy } from "@/features/academy/types";
import { LabStorage } from "@/features/lab/storage/LabStorage";
import type { LabProject } from "@/features/lab/types";
import { LearningStorage } from "@/features/learning/LearningStorage";
import type { LearningProfile } from "@/features/learning/types";

function formatReview(value?: string) {
  if (!value) return "A definir";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
}

export function AcademyLabOverview() {
  const [academy, setAcademy] = useState<AcademyStudy[]>([]);
  const [lab, setLab] = useState<LabProject[]>([]);
  const [learning, setLearning] = useState<LearningProfile>();
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [academyStudies, labProjects, profile] = await Promise.all([
      AcademyStorage.list(),
      LabStorage.list(),
      LearningStorage.load(),
    ]);
    setAcademy(academyStudies);
    setLab(labProjects);
    setLearning(profile);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const onUpdate = () => void load();
    window.addEventListener(ACADEMY_UPDATED_EVENT, onUpdate);
    window.addEventListener("studyai:learning-updated", onUpdate);
    const unsubscribeLab = LabStorage.subscribe(onUpdate);
    return () => {
      window.removeEventListener(ACADEMY_UPDATED_EVENT, onUpdate);
      window.removeEventListener("studyai:learning-updated", onUpdate);
      unsubscribeLab();
    };
  }, [load]);

  const data = useMemo(() => {
    const continueStudy = academy.find((study) => study.status !== "completed") ?? academy[0];
    const continuePractice = lab.find((project) => project.status !== "completed") ?? lab[0];
    const contents = academy.flatMap((study) => study.contents.map((content) => ({ study, content })))
      .sort((left, right) => right.content.generatedAt.localeCompare(left.content.generatedAt))
      .slice(0, 3);
    const reviews = academy.flatMap((study) => {
      const nextReviewAt = learning?.topics[study.id]?.nextReviewAt;
      return nextReviewAt ? [{ study, nextReviewAt }] : [];
    }).sort((left, right) => left.nextReviewAt.localeCompare(right.nextReviewAt));
    return { continueStudy, continuePractice, contents, nextReview: reviews[0], pending: lab.filter((project) => project.status !== "completed").length };
  }, [academy, lab, learning]);

  if (loading) return <div aria-label="Carregando Academy e Laboratório" className="h-44 animate-pulse rounded-2xl border bg-muted/30" />;
  if (academy.length === 0 && lab.length === 0) return (
    <Card className="gap-4 border-dashed p-5 shadow-none sm:flex-row sm:items-center">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-5" /></span>
      <div className="min-w-0 flex-1"><h2 className="font-semibold">Academy e Laboratório</h2><p className="text-sm text-muted-foreground">Crie um estudo livre ou pratique um exercício para acompanhar tudo aqui.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link href="/lab">Abrir Lab</Link></Button><Button asChild><Link href="/academy">Criar estudo</Link></Button></div>
    </Card>
  );

  return (
    <section aria-labelledby="academy-lab-overview-title" className="space-y-3">
      <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-primary">Academy + Lab</p><h2 id="academy-lab-overview-title" className="text-lg font-semibold">Continue sua jornada</h2></div><Button asChild variant="ghost" size="sm"><Link href="/academy">Ver Academy <ArrowRight /></Link></Button></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Card className="gap-3 p-4 shadow-none"><BookOpenCheck className="size-5 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">Continuar estudo livre</p><p className="truncate font-semibold">{data.continueStudy?.title ?? "Nenhum estudo"}</p></div>{data.continueStudy ? <Button asChild size="sm" variant="outline"><Link href={`/academy?estudo=${encodeURIComponent(data.continueStudy.id)}`}>Continuar</Link></Button> : null}</Card>
        <Card className="gap-3 p-4 shadow-none"><FlaskConical className="size-5 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">Continuar prática</p><p className="truncate font-semibold">{data.continuePractice?.title ?? "Nenhuma prática"}</p></div>{data.continuePractice ? <Button asChild size="sm" variant="outline"><Link href={`/lab?exercise=${encodeURIComponent(data.continuePractice.id)}`}>Praticar</Link></Button> : null}</Card>
        <Card className="gap-3 p-4 shadow-none"><Sparkles className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">Últimos conteúdos gerados</p><p className="font-semibold">{data.contents.length}</p></div><div className="space-y-1">{data.contents.slice(0, 2).map(({ study, content }) => <Link key={content.id} href={`/academy?estudo=${encodeURIComponent(study.id)}&conteudo=${encodeURIComponent(content.id)}`} className="block truncate text-xs text-muted-foreground hover:text-foreground">{content.title}</Link>)}</div></Card>
        <Card className="gap-3 p-4 shadow-none"><BrainCircuit className="size-5 text-primary" /><div><p className="text-xs text-muted-foreground">Exercícios pendentes</p><p className="font-semibold">{data.pending}</p></div><Badge variant="outline">Laboratório</Badge></Card>
        <Card className="gap-3 p-4 shadow-none"><CalendarClock className="size-5 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">Próxima revisão da Academy</p><p className="truncate font-semibold">{data.nextReview?.study.title ?? "Sem revisão agendada"}</p><p className="mt-1 text-xs text-muted-foreground">{formatReview(data.nextReview?.nextReviewAt)}</p></div></Card>
      </div>
    </section>
  );
}
