"use client";

import { Activity, BrainCircuit, ClipboardCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExamProgressSnapshot } from "../ExamProgressService";

const progressStateLabels = {
  not_started: "Não iniciado",
  in_progress: "Em andamento",
  completed: "Concluído",
  insufficient_data: "Sem dados suficientes",
} as const;

export function ExamRealProgressCard({
  examProgress,
  progressLoading,
  progressError,
}: {
  examProgress?: ExamProgressSnapshot | null;
  progressLoading: boolean;
  progressError?: string | null;
}) {
  return (
    <Card className="p-6 shadow-none" aria-labelledby="exam-real-progress-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="exam-real-progress-title" className="text-base font-semibold">Progresso real vinculado</h3>
          <p className="text-sm font-medium">Histórico dos estudos · compartilhado entre avaliações que usam o mesmo estudo</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Conteúdo, atividades e desempenho são exibidos separadamente e nunca alterados apenas por abrir esta página.
          </p>
        </div>
        {examProgress ? <Badge variant="outline">{progressStateLabels[examProgress.state]}</Badge> : null}
      </div>

      {progressLoading ? (
        <div role="status" aria-label="Carregando registros autorizados" className="mt-5 space-y-2">
          <span className="sr-only">Carregando registros autorizados…</span>
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      ) : progressError ? (
        <Feedback variant="warning" role="status" className="mt-5 p-4">{progressError}</Feedback>
      ) : !examProgress || examProgress.state === "insufficient_data" ? (
        <p className="mt-5 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          Sem dados suficientes. Vincule um estudo ou material organizado desta conta para consolidar o progresso.
        </p>
      ) : (
        <div className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border bg-card/40 p-4">
              <Target className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{examProgress.studyProgress ?? 0}%</p>
              <p className="text-xs text-muted-foreground">Progresso do conteúdo · {examProgress.topicsStudied} tema(s) estudado(s)</p>
            </div>
            <div className="rounded-xl border bg-card/40 p-4">
              <Activity className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{examProgress.activitiesCompleted}</p>
              <p className="text-xs text-muted-foreground">Atividades registradas · {examProgress.studyMinutes} min</p>
            </div>
            <div className="rounded-xl border bg-card/40 p-4">
              <BrainCircuit className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{examProgress.flashcardReviews}</p>
              <p className="text-xs text-muted-foreground">Revisões · {examProgress.reviewedCards} cartão(ões) distinto(s)</p>
            </div>
            <div className="rounded-xl border bg-card/40 p-4">
              <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-2 text-2xl font-bold">{examProgress.performance === null ? "—" : `${examProgress.performance}%`}</p>
              <p className="text-xs text-muted-foreground">Desempenho em {examProgress.quizAttempts} quiz(zes) · {examProgress.correctAnswers} acertos / {examProgress.wrongAnswers} erros</p>
            </div>
          </div>

          <div className="space-y-2" aria-label="Estudos associados à prova">
            {examProgress.studies.map((study) => (
              <div key={study.studyId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                <div>
                  <p className="font-medium">{study.title}</p>
                  <p className="text-xs text-muted-foreground">{study.subject}</p>
                </div>
                <span className="font-semibold">{study.progress}% · {progressStateLabels[study.status]}</span>
              </div>
            ))}
          </div>

          {!examProgress.canAssociateDatedActivities ? (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
              Esta prova não possui uma data de criação válida; atividades históricas não foram associadas automaticamente.
            </p>
          ) : null}
          <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
            Resultados do Modo Prova protegido não entram neste resumo porque as tentativas atuais não persistem `examId` ou `studyId`. O gabarito permanece protegido no servidor.
          </p>
        </div>
      )}
    </Card>
  );
}
