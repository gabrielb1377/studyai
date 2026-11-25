"use client";

import Link from "next/link";
import { Bot, BrainCircuit, ClipboardCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { examLearningHref, type ExamLearningAction } from "../ExamLearningNavigation";
import type { Exam } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";

const learningActions: Array<{
  id: ExamLearningAction;
  title: string;
  description: string;
  icon: typeof Bot;
}> = [
  { id: "tutor", title: "Estudar com Tutor", description: "Conversar usando o contexto autorizado deste estudo.", icon: Bot },
  { id: "flashcards", title: "Revisar Flashcards", description: "Retomar cartões e agendamento deste estudo.", icon: BrainCircuit },
  { id: "quiz", title: "Praticar Quiz", description: "Usar questões e resultados já vinculados ao estudo.", icon: ClipboardCheck },
  { id: "exam", title: "Abrir Simulado", description: "Entrar no Modo Prova com gabarito protegido no servidor.", icon: ShieldCheck },
];

export function ExamLearningActionsCard({
  exam,
  linkedStudy,
}: {
  exam: Exam;
  linkedStudy?: StudyRecord;
}) {
  return (
    <Card className="p-6 shadow-none" aria-labelledby="exam-learning-actions-title">
      <div>
        <h3 id="exam-learning-actions-title" className="text-base font-semibold">Atividades desta prova</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {linkedStudy
            ? `As atividades usarão somente o estudo “${linkedStudy.title}”.`
            : exam.studyId
              ? "O estudo vinculado não está disponível nesta conta. O vínculo foi preservado."
              : "Vincule um estudo para abrir atividades com o contexto correto."}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {learningActions.map((action) => {
          const Icon = action.icon;
          return (
            <div key={action.id} className="flex flex-col rounded-xl border bg-card/40 p-4">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold">{action.title}</p>
              <p className="mt-1 flex-1 text-xs leading-5 text-muted-foreground">{action.description}</p>
              {linkedStudy ? (
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link href={examLearningHref(linkedStudy.studyId, action.id, exam.id)}>Abrir</Link>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled>
                  Indisponível
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
