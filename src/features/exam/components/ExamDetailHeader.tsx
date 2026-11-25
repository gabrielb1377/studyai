"use client";

import Link from "next/link";
import { Calendar, Clock, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatExamDate } from "../ExamService";
import { examLearningHref } from "../ExamLearningNavigation";
import type { Exam } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";

export function ExamDetailHeader({
  exam,
  daysLeft,
  progressPercent,
  completedCount,
  totalCount,
  linkedStudy,
  onEdit,
  onDelete,
}: {
  exam: Exam;
  daysLeft: number;
  progressPercent: number;
  completedCount: number;
  totalCount: number;
  linkedStudy?: StudyRecord;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-6 space-y-4 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Badge variant="outline" className="mb-2">{exam.discipline}</Badge>
          <h2 className="text-xl font-bold">{exam.title}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-1">
            <Calendar className="size-4" /> Data: {formatExamDate(exam.examDate)}{" "}
            {exam.examTime && `às ${exam.examTime}`} (
            {daysLeft < 0 ? "Prova já ocorreu" : daysLeft === 0 ? "É hoje!" : `Faltam ${daysLeft} dias`}
            )
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/planejamento?prova=${encodeURIComponent(exam.id)}`}>
              Planejar no cronograma
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 size-4" />
            Editar prova
          </Button>
          <Button
            type="button"
            aria-label={`Excluir prova ${exam.title}`}
            variant="destructive"
            size="icon-sm"
            onClick={onDelete}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 pt-2 border-t">
        <div className="p-3 rounded-lg border bg-card/50">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Progresso dos Assuntos</p>
          <p className="text-2xl font-bold mt-1">{progressPercent}%</p>
          <p className="text-xs text-muted-foreground mt-0.5">{completedCount} de {totalCount} concluídos</p>
        </div>
        <div className="p-3 rounded-lg border bg-card/50">
          <p className="text-xs text-muted-foreground uppercase font-semibold">Meta Diária</p>
          <p className="text-2xl font-bold mt-1 flex items-center gap-1">
            <Clock className="size-5 text-primary" /> {exam.dailyMinutes} min
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Tempo dedicado por dia</p>
        </div>
        <div className="p-3 rounded-lg border bg-card/50 flex flex-col justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase font-semibold">Ação rápida</p>
            <p className="text-sm font-medium mt-1">Simulado protegido</p>
          </div>
          {linkedStudy ? (
            <Button asChild size="sm" className="mt-2 w-full">
              <Link href={examLearningHref(linkedStudy.studyId, "exam", exam.id)}>
                <ShieldCheck className="mr-1.5 size-3.5" />
                Abrir Modo Prova
              </Link>
            </Button>
          ) : (
            <Button type="button" size="sm" className="mt-2 w-full" disabled>
              Vincule um estudo
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
