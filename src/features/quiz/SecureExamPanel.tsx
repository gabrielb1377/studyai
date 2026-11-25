"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, LoaderCircle, RotateCcw, ShieldCheck, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/features/account/AuthProvider";
import { hasStructuredStudyContent } from "@/features/study/services/StudyEngine";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";
import { ConnectivityService, isLikelyNetworkError } from "@/features/platform/ConnectivityService";
import { useConnectivity } from "@/features/platform/useConnectivity";
import { useUpdateGuard } from "@/features/platform/UpdateSafety";
import type { ExamAttemptRecord, ExamAttemptResult } from "@/types/exam";
import type { StudyRecord } from "@/types/study-engine";
import { SecureExamClient, type SecureExamConfig } from "./SecureExamClient";

const labels = "ABCDE";

function currentQuizState(studyId: string) {
  return WorkspacePersistence.load(studyId).quiz;
}

function saveQuizState(studyId: string, changes: { index?: number; attemptId?: string; answers?: Array<number | null>; finished?: boolean }) {
  const current = currentQuizState(studyId);
  WorkspacePersistence.save(studyId, {
    quiz: {
      ...current,
      mode: "exam",
      index: changes.index ?? current.index,
      attemptId: "attemptId" in changes ? changes.attemptId : current.attemptId,
      secureAnswers: changes.answers ?? current.secureAnswers,
      secureFinished: changes.finished ?? current.secureFinished,
    },
  });
}

export function SecureExamPanel({ study }: { study: StudyRecord }) {
  const { session, isLoading: isAuthLoading } = useAuth();
  const { isOnline } = useConnectivity();
  const stored = currentQuizState(study.studyId);
  const [attempt, setAttempt] = useState<ExamAttemptRecord | null>(null);
  const [result, setResult] = useState<ExamAttemptResult | null>(null);
  const [attemptId, setAttemptId] = useState(stored.attemptId);
  const [answers, setAnswers] = useState<Array<number | null>>(stored.secureAnswers ?? []);
  const [index, setIndex] = useState(stored.index);
  const [count, setCount] = useState<SecureExamConfig["count"]>(5);
  const [difficulty, setDifficulty] = useState<SecureExamConfig["difficulty"]>("medium");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(!stored.attemptId);

  useUpdateGuard(Boolean(attempt && !result), "secure-exam", "Simulado protegido");

  useEffect(() => {
    const userId = session?.user.id;
    if (!attemptId || !userId || !isOnline) return;
    let active = true;
    setIsResuming(true);
    setError(null);
    void SecureExamClient.resume(attemptId, userId)
      .then((loaded) => {
        if (!active) return;
        ConnectivityService.reportNetworkSuccess();
        setAttempt(loaded);
        if (loaded.result) {
          setResult(loaded.result);
          setAnswers(loaded.result.answers);
          setIndex(0);
        }
      })
      .catch((resumeError: unknown) => {
        if (!active) return;
        if (isLikelyNetworkError(resumeError)) {
          ConnectivityService.reportNetworkFailure(resumeError);
          setError("Sem conexão com a internet para retomar a tentativa no servidor. Suas respostas locais foram preservadas.");
        } else {
          setError(SecureExamClient.message(resumeError));
          setShowConfig(true);
        }
      })
      .finally(() => {
        if (active) setIsResuming(false);
      });
    return () => { active = false; };
  }, [attemptId, isOnline, session?.user.id]);

  useEffect(() => {
    if (attempt && index >= attempt.questions.length) setIndex(0);
    if (result && index >= result.questions.length) setIndex(0);
  }, [attempt, index, result]);

  const canGenerate = hasStructuredStudyContent(study);
  const questions = result?.questions ?? attempt?.questions ?? [];
  const currentQuestion = questions[index];
  const activeAnswers = result?.answers ?? answers;
  const total = result?.totalCount ?? attempt?.totalCount ?? questions.length;

  const generate = async () => {
    if (!session || isGenerating) return;
    if (!ConnectivityService.getSnapshot().isOnline) {
      setError("Sem conexão com a internet. O Modo Prova protegido exige conexão para gerar questões no servidor.");
      return;
    }
    setError(null);
    setIsGenerating(true);
    setResult(null);
    setAttempt(null);
    setAnswers([]);
    setIndex(0);
    try {
      const created = await SecureExamClient.create(study, { count, difficulty }, session.user.id);
      ConnectivityService.reportNetworkSuccess();
      setAttempt(created);
      setAttemptId(created.attemptId);
      setAnswers(Array.from({ length: created.totalCount }, () => null));
      saveQuizState(study.studyId, { attemptId: created.attemptId, answers: Array.from({ length: created.totalCount }, () => null), index: 0, finished: false });
      setShowConfig(false);
    } catch (generationError) {
      if (isLikelyNetworkError(generationError)) {
        ConnectivityService.reportNetworkFailure(generationError);
        setError("Sem conexão com a internet. Aguarde a reconexão para gerar a prova protegida.");
      } else {
        setError(SecureExamClient.message(generationError));
      }
      setShowConfig(true);
    } finally {
      setIsGenerating(false);
    }
  };

  const answer = (alternative: number) => {
    const next = [...answers];
    next[index] = alternative;
    setAnswers(next);
    saveQuizState(study.studyId, { index, answers: next });
  };

  const goTo = (next: number) => {
    setIndex(next);
    saveQuizState(study.studyId, { index: next, answers });
  };

  const submit = async () => {
    if (!session || !attempt || isSubmitting) return;
    if (!ConnectivityService.getSnapshot().isOnline) {
      setError("Sem conexão com a internet. Suas marcações permanecem salvas localmente; entregue a prova quando reconectar.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const graded = await SecureExamClient.grade(attempt.attemptId, answers, session.user.id);
      ConnectivityService.reportNetworkSuccess();
      setResult(graded);
      setAnswers(graded.answers);
      setIndex(0);
      saveQuizState(study.studyId, { attemptId: attempt.attemptId, answers: graded.answers, index: 0, finished: true });
    } catch (submissionError) {
      if (isLikelyNetworkError(submissionError)) {
        ConnectivityService.reportNetworkFailure(submissionError);
        setError("Sem conexão com a internet. Suas marcações continuam salvas localmente para envio após a reconexão.");
      } else {
        setError(SecureExamClient.message(submissionError));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const restart = () => {
    setAttempt(null);
    setResult(null);
    setAttemptId(undefined);
    setAnswers([]);
    setIndex(0);
    setError(null);
    saveQuizState(study.studyId, { attemptId: undefined, answers: [], index: 0, finished: false });
    setShowConfig(true);
  };

  if (isAuthLoading) {
    return <Card className="p-6 text-sm text-muted-foreground">Verificando sua sessão…</Card>;
  }

  if (!session) {
    return (
      <Card className="space-y-3 border-primary/20 p-6">
        <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-5 text-primary" /> Modo Prova protegido</div>
        <p className="text-sm text-muted-foreground">Entre na sua conta para criar uma tentativa com correção no servidor e gabarito protegido.</p>
        <Button asChild className="w-full sm:w-auto"><Link href="/conta">Entrar na conta</Link></Button>
      </Card>
    );
  }

  if (result) {
    const wrong = result.totalCount - result.correctCount;
    return (
      <div className="space-y-4">
        <Card className="items-center gap-4 p-5 text-center shadow-none sm:p-7">
          <CheckCircle2 className="size-10 text-primary" />
          <div>
            <Badge variant="outline" className="mb-2"><ShieldCheck className="mr-1 size-3.5" /> Correção no servidor</Badge>
            <h3 className="text-xl font-bold">Prova corrigida</h3>
            <p className="mt-1 text-sm text-muted-foreground">O gabarito e as explicações foram liberados após a entrega.</p>
          </div>
          <div className="grid w-full max-w-md gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card/50 p-3"><strong>{result.correctCount}</strong><br /><span className="text-xs text-muted-foreground">Acertos</span></div>
            <div className="rounded-lg border bg-card/50 p-3"><strong>{wrong}</strong><br /><span className="text-xs text-muted-foreground">Erros</span></div>
            <div className="rounded-lg border bg-card/50 p-3"><strong>{result.score.toFixed(2)}%</strong><br /><span className="text-xs text-muted-foreground">Nota</span></div>
          </div>
        </Card>

        <div className="space-y-3">
          {result.questions.map((question, questionIndex) => {
            const selected = result.answers[questionIndex];
            const correct = selected === question.correctAnswer;
            return (
              <Card key={question.id} className={`space-y-2 p-4 shadow-none ${correct ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">Questão {questionIndex + 1}</span>
                  <Badge variant={correct ? "default" : "destructive"}>{correct ? "Acertou" : "Errou"}</Badge>
                </div>
                <p className="font-medium">{question.question}</p>
                <p className="text-xs text-muted-foreground">
                  Sua resposta: {selected != null && selected >= 0 ? question.alternatives[selected] : "Não respondida"}
                  {correct ? "" : ` (Correta: ${question.alternatives[question.correctAnswer]})`}
                </p>
                <div className="rounded-lg border bg-background/80 p-3 text-xs leading-relaxed">
                  <strong>Explicação: </strong>{question.explanation}
                </div>
              </Card>
            );
          })}
        </div>

        <Button type="button" variant="outline" onClick={restart} disabled={!isOnline}><RotateCcw className="mr-2 size-4" /> Refazer prova protegida</Button>
      </div>
    );
  }

  if (isResuming && !attempt) {
    return <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Retomando tentativa…</Card>;
  }

  if (!attempt) {
    return (
      <Card className="space-y-4 border-primary/20 p-5 shadow-none sm:p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div>
            <h3 className="font-semibold">Simulado protegido</h3>
            <p className="mt-1 text-sm text-muted-foreground">As questões são geradas no servidor. Você só verá o gabarito e as explicações depois de entregar.</p>
          </div>
        </div>

        {!isOnline && (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-muted-foreground">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <p>
              Modo Prova protegido indisponível sem internet. Para proteger os gabaritos e corrigir com segurança no servidor, aguarde a reconexão.
            </p>
          </div>
        )}

        {(showConfig || !attemptId) && (
          <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="secure-exam-count">Quantidade</label>
              <select id="secure-exam-count" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={count} onChange={(event) => setCount(Number(event.target.value) as SecureExamConfig["count"])}>
                <option value={5}>5 questões</option>
                <option value={10}>10 questões</option>
                <option value={20}>20 questões</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase text-muted-foreground" htmlFor="secure-exam-difficulty">Dificuldade</label>
              <select id="secure-exam-difficulty" className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm" value={difficulty} onChange={(event) => setDifficulty(event.target.value as SecureExamConfig["difficulty"])}>
                <option value="easy">Fácil</option>
                <option value="medium">Média</option>
                <option value="hard">Difícil</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="button" className="w-full" onClick={() => void generate()} disabled={isGenerating || !canGenerate || !isOnline}>
                {isGenerating ? <><LoaderCircle className="mr-2 size-4 animate-spin" /> Gerando…</> : "Gerar prova protegida"}
              </Button>
            </div>
          </div>
        )}

        {!canGenerate && <p className="text-sm text-muted-foreground">Este estudo ainda não possui conteúdo estruturado suficiente para gerar a prova.</p>}
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!isOnline && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-muted-foreground">
          <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <p>
            Sem conexão com a internet. Você pode marcar suas respostas localmente, mas a entrega com correção no servidor só fica disponível após a reconexão.
          </p>
        </div>
      )}

      <Card className="space-y-4 p-5 shadow-none sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant="secondary"><ShieldCheck className="mr-1 size-3.5" /> Questão {index + 1} de {attempt.totalCount}</Badge>
          <span className="text-xs text-muted-foreground">Gabarito protegido no servidor</span>
        </div>
        <h3 className="text-lg font-semibold leading-relaxed">{currentQuestion?.question}</h3>
        <div className="grid gap-2">
          {currentQuestion?.alternatives.map((alternative, alternativeIndex) => {
            const selected = activeAnswers[index] === alternativeIndex;
            return (
              <Button
                key={`${currentQuestion.id}-${alternativeIndex}`}
                type="button"
                variant="outline"
                aria-pressed={selected}
                className={`h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left ${selected ? "border-primary bg-primary/10 font-semibold" : ""}`}
                onClick={() => answer(alternativeIndex)}
              >
                <span className="mr-2 font-semibold">{labels[alternativeIndex] ?? alternativeIndex + 1}.</span>
                {alternative}
              </Button>
            );
          })}
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => goTo(Math.max(0, index - 1))} disabled={index === 0}>
          <ChevronLeft className="mr-1 size-4" /> Anterior
        </Button>
        <div className="flex flex-wrap gap-1">
          {attempt.questions.map((question, questionIndex) => (
            <button
              key={question.id}
              type="button"
              onClick={() => goTo(questionIndex)}
              aria-label={`Ir para questão ${questionIndex + 1}`}
              aria-current={index === questionIndex ? "step" : undefined}
              className={`size-8 rounded-lg text-xs font-semibold ${index === questionIndex ? "bg-primary text-primary-foreground" : activeAnswers[questionIndex] != null ? "border bg-accent text-accent-foreground" : "border bg-card"}`}
            >
              {questionIndex + 1}
            </button>
          ))}
        </div>
        {index + 1 < attempt.questions.length ? (
          <Button type="button" size="sm" onClick={() => goTo(index + 1)}>Próxima <ChevronRight className="ml-1 size-4" /></Button>
        ) : (
          <Button type="button" size="sm" onClick={() => void submit()} disabled={isSubmitting || !isOnline}>
            {isSubmitting ? <><LoaderCircle className="mr-2 size-4 animate-spin" /> Corrigindo…</> : "Entregar Prova"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{activeAnswers.filter((answerValue) => answerValue != null).length} de {total} respondidas</span>
        {error && <span role="alert" className="flex items-center gap-1 text-destructive"><AlertCircle className="size-3.5" /> {error}</span>}
      </div>
    </div>
  );
}
