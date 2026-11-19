"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionOperationManager } from "@/features/account/SessionOperationManager";
import { ExamService, EXAM_UPDATED_EVENT, formatExamDate } from "@/features/exam/ExamService";
import type { ExtractedContent } from "@/features/extraction/ExtractionTypes";
import type { TopicReview } from "@/features/learning/TopicReview";
import { TopicReviewStorage } from "@/features/learning/TopicReviewStorage";
import { STORAGE_UPDATED_EVENT } from "@/lib/storage/StorageManager";
import type { Exam } from "@/types/exam";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";
import { summarizeStudyProgress } from "./StudyProgressSummary";

type Props = {
  studies: StudyRecord[];
  materials: Material[];
  contents: ExtractedContent[];
  loading: boolean;
  incomplete: boolean;
};

const linkClass = "text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline";
const studyHref = (id: string) => `/estudo?tema=${encodeURIComponent(id)}`;
const examHref = (id: string) => `/provas?prova=${encodeURIComponent(id)}`;

function Section({ title, href, action, children }: {
  title: string; href: string; action: string; children: ReactNode;
}) {
  return <Card className="min-w-0 gap-3 p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="font-semibold">{title}</h3>
      <Link className={linkClass} href={href}>{action}</Link>
    </div>
    {children}
  </Card>;
}

export function StudyProgressPanel(props: Props) {
  const auth = useAuth();
  const session = SessionOperationManager.current();
  if (auth.isLoading || session.suspended || !session.userId || props.loading) {
    return <div role="status" aria-busy="true" className="rounded-xl border p-4 text-sm text-muted-foreground">Carregando progresso dos estudos…</div>;
  }
  return <ProgressContent key={session.generation} {...props} />;
}

function ProgressContent({ studies, materials, contents, incomplete }: Props) {
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [reviews, setReviews] = useState<TopicReview[] | null>(null);
  const [reviewError, setReviewError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let revision = 0;
    const reloadExams = () => setExams(ExamService.load());
    const reloadReviews = () => {
      const request = ++revision;
      const session = SessionOperationManager.current();
      if (session.suspended || !session.userId) { setReviews(null); return; }
      const operation = SessionOperationManager.start();
      void TopicReviewStorage.load().then((items) => {
        operation.assertCurrent();
        if (request === revision) { setReviews(items); setReviewError(false); }
      }).catch(() => {
        if (request === revision) { setReviews([]); setReviewError(true); }
      }).finally(() => operation.release());
    };
    const storageUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.store === "metadata" || detail?.scopeChanged) reloadReviews();
      if (detail?.scopeChanged) reloadExams();
    };
    const refresh = () => { setNow(new Date()); reloadExams(); reloadReviews(); };
    refresh();
    window.addEventListener(EXAM_UPDATED_EVENT, reloadExams);
    window.addEventListener(STORAGE_UPDATED_EVENT, storageUpdate);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => {
      revision++;
      window.removeEventListener(EXAM_UPDATED_EVENT, reloadExams);
      window.removeEventListener(STORAGE_UPDATED_EVENT, storageUpdate);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => summarizeStudyProgress(studies, materials, reviews ?? [], exams ?? [], contents, now),
    [studies, materials, reviews, exams, contents, now]);
  const muted = "text-sm text-muted-foreground";
  return <section aria-labelledby="study-progress-heading" className="space-y-3">
    <h2 id="study-progress-heading" className="text-xl font-semibold">Meu progresso</h2>
    {incomplete && <p role="status" className={muted}>Parte dos dados de estudo está indisponível.</p>}
    <div className="grid min-w-0 gap-3 lg:grid-cols-2">
      <Section title="Disciplinas" href="/biblioteca" action="Abrir biblioteca">
        {summary.disciplines.length ? <ul className="divide-y">
          {summary.disciplines.map((group) => <li key={group.key} className="space-y-1 py-2 break-words">
            <h4 className="font-medium">{group.title}</h4>
            {group.detail && <p className={muted}>{group.detail}</p>}
            {group.studies.length ? <ul className="space-y-1">
              {group.studies.map((study) => <li key={study.studyId} className="flex flex-wrap justify-between gap-x-3">
                <Link className={linkClass} href={studyHref(study.studyId)}>{study.title}</Link>
                <span className={muted}>{Number.isFinite(study.progress) && study.progress >= 0 && study.progress <= 100 ? `${study.progress}%` : "Progresso indisponível"}</span>
              </li>)}
            </ul> : <p className={muted}>Nenhum estudo vinculado.</p>}
          </li>)}
        </ul> : <p className={muted}>{incomplete ? "Disciplinas indisponíveis." : "Nenhuma disciplina cadastrada."}</p>}
      </Section>
      <Section title="Revisões" href="/estudo/revisao" action="Abrir revisões">
        {reviewError ? <p role="status" className={muted}>Não foi possível carregar as revisões.</p>
          : reviews === null ? <p role="status" className={muted}>Carregando revisões…</p>
            : summary.pending.length ? <ul className="divide-y">
              {summary.pending.map(({ group, study, review, period }) => <li key={JSON.stringify([group.key, study.studyId])} className="py-2 break-words">
                <Link className={linkClass} href={`/estudo/revisao?disciplina=${encodeURIComponent(group.key)}`}>{study.title}</Link>
                <p className={muted}>{group.title} · {period === "late" ? "Atrasada" : period === "today" ? "Hoje" : new Date(review.nextReviewAt).toLocaleDateString("pt-BR")}</p>
              </li>)}
            </ul> : <p className={muted}>{incomplete ? "Não foi possível confirmar revisões pendentes." : "Nenhuma revisão agendada."}</p>}
      </Section>
      <Section title="Próximas avaliações" href="/provas" action="Abrir avaliações">
        {exams === null ? <p role="status" className={muted}>Carregando avaliações…</p>
          : summary.upcoming.length ? <ul className="divide-y">
            {summary.upcoming.map(({ exam, days }) => <li key={exam.id} className="py-2 break-words">
              <Link className={linkClass} href={examHref(exam.id)}>{exam.title}</Link>
              <p className={muted}>{exam.discipline} · {formatExamDate(exam.examDate)} · {days === 0 ? "Hoje" : days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`}</p>
            </li>)}
          </ul> : <p className={muted}>Nenhuma avaliação futura com data válida.</p>}
      </Section>
      <Section title="Simulados locais" href="/provas" action="Abrir simulados">
        {exams === null ? <p role="status" className={muted}>Carregando simulados…</p>
          : summary.simulations.length ? <ul className="divide-y">
            {summary.simulations.map(({ exam, count, correct, wrong, declaredCorrect, declaredWrong }) => <li key={exam.id} className="py-2 break-words">
              <Link className={linkClass} href={examHref(exam.id)}>{exam.title}</Link>
              <p className={muted}>{exam.discipline} · {count} {count === 1 ? "simulado concluído" : "simulados concluídos"}</p>
              <p className={muted}>{correct + wrong ? `Gabarito conferido: ${correct} acertos, ${wrong} erros` : "Sem correção objetiva disponível."}</p>
              {declaredCorrect + declaredWrong > 0 && <p className={muted}>Autoavaliação: {declaredCorrect} acertos, {declaredWrong} erros</p>}
            </li>)}
          </ul> : <p className={muted}>Nenhum simulado local concluído.</p>}
        <p className={muted}>Tentativas do Modo Prova protegido ficam fora deste resumo.</p>
      </Section>
    </div>
  </section>;
}
