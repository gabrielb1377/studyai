"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ClipboardCheck, LoaderCircle, Plus, ChevronLeft, ChevronRight, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudyRecord } from "@/types/study-engine";
import type { Flashcard } from "@/types/flashcard";
import { QuizService } from "./QuizService";
import { QuizQuestion } from "./QuizQuestion";
import { SecureExamPanel } from "./SecureExamPanel";
import { useQuiz } from "./useQuiz";
import { hasStructuredStudyContent } from "@/features/study/services/StudyEngine";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { ErrorNotebookStorage, ERROR_NOTEBOOK_UPDATED_EVENT } from "@/features/learning/errors/ErrorNotebookStorage";
import type { CreateErrorEntryInput, ErrorNotebookEntry } from "@/features/learning/errors/types";
import { FlashcardService } from "@/features/flashcards/FlashcardService";
import { LearningStorage } from "@/features/learning/LearningStorage";
import type { LearningProfile } from "@/features/learning/types";
import { AdaptiveAssessmentEngine } from "@/features/learning/adaptive/AdaptiveAssessmentEngine";
import type { AdaptiveDifficultyMode, AdaptiveSelectionReason } from "@/features/learning/adaptive/types";


export function QuizWorkspace({ study }: { study: StudyRecord }) {
  const { questions, results, error, isGenerating, generate, saveResult } = useQuiz(study.studyId);
  const stored = WorkspacePersistence.load(study.studyId).quiz;
  const [index, setIndex] = useState(stored.index);
  const [answers, setAnswers] = useState<Array<number | null>>(stored.answers || []);
  const [isFinished, setIsFinished] = useState(stored.isFinished);
  const [mode, setMode] = useState<"practice" | "exam">(stored.mode ?? "practice");
  const [showConfig, setShowConfig] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<AdaptiveDifficultyMode>("adaptive");
  const [errorEntries, setErrorEntries] = useState<ErrorNotebookEntry[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [learningProfile, setLearningProfile] = useState<LearningProfile | null>(null);
  const [adaptiveQuestionIds, setAdaptiveQuestionIds] = useState<string[] | null>(null);
  const [adaptiveSummary, setAdaptiveSummary] = useState<string | null>(null);
  const [adaptiveReasons, setAdaptiveReasons] = useState<Record<string, AdaptiveSelectionReason>>({});

  useEffect(() => {
    let cancelled = false;
    const loadSignals = () => {
      void Promise.all([
        ErrorNotebookStorage.load().catch(() => []),
        FlashcardService.load().catch(() => []),
        LearningStorage.load().catch(() => null),
      ]).then(([loadedErrors, loadedCards, loadedProfile]) => {
        if (cancelled) return;
        setErrorEntries(loadedErrors.filter((entry) => entry.studyId === study.studyId));
        setFlashcards(loadedCards.filter((card) => card.studyId === study.studyId));
        setLearningProfile(loadedProfile);
      });
    };
    loadSignals();
    window.addEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, loadSignals);
    window.addEventListener("studyai:flashcards-updated", loadSignals);
    return () => {
      cancelled = true;
      window.removeEventListener(ERROR_NOTEBOOK_UPDATED_EVENT, loadSignals);
      window.removeEventListener("studyai:flashcards-updated", loadSignals);
    };
  }, [study.studyId]);

  const activeQuestions = useMemo(() => {
    if (!adaptiveQuestionIds) return questions;
    const byId = new Map(questions.map((q) => [q.id, q]));
    const mapped = adaptiveQuestionIds.map((id) => byId.get(id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
    return mapped.length > 0 ? mapped : questions;
  }, [adaptiveQuestionIds, questions]);

  useEffect(() => {
    if (activeQuestions.length > 0 && index >= activeQuestions.length) setIndex(0);
  }, [index, activeQuestions.length]);

  const currentQuestion = activeQuestions[index];
  const canGenerate = hasStructuredStudyContent(study);
  const studyKnowledge = useMemo(
    () => (learningProfile ? KnowledgeEngine.calculate(study, learningProfile, flashcards, results) : undefined),
    [flashcards, learningProfile, results, study],
  );
  const indicator = useMemo(
    () =>
      AdaptiveAssessmentEngine.computeReliableIndicators({
        study,
        quizzes: results,
        flashcards,
        errorEntries,
        knowledge: studyKnowledge,
      }),
    [errorEntries, flashcards, results, study, studyKnowledge],
  );

  const savePractice = (changes: { index: number; answers: Array<number | null>; isFinished: boolean; mode: "practice" | "exam" }) => {
    const current = WorkspacePersistence.load(study.studyId).quiz;
    WorkspacePersistence.save(study.studyId, { quiz: { ...current, ...changes } });
  };

  const handleAnswer = (questionIndex: number, alternativeIndex: number) => {
    const next = [...answers];
    next[questionIndex] = alternativeIndex;
    setAnswers(next);
    savePractice({ index, answers: next, isFinished, mode });
  };

  const goToQuestion = (next: number) => {
    setIndex(next);
    savePractice({ index: next, answers, isFinished, mode });
  };

  const submitExam = () => {
    const correct = activeQuestions.reduce((total, question, qIdx) => total + (answers[qIdx] === question.correctAnswer ? 1 : 0), 0);
    const wrong = activeQuestions.length - correct;
    saveResult(QuizService.createResult(study.studyId, activeQuestions.map((q) => q.id), correct, wrong));
    const wrongEntries: CreateErrorEntryInput[] = activeQuestions.flatMap((question, qIdx) => {
      const selectedChoice = answers[qIdx];
      if (selectedChoice === question.correctAnswer) return [];
      const wrongAnswer =
        selectedChoice === null || selectedChoice === undefined
          ? "Sem resposta selecionada"
          : question.alternatives[selectedChoice] ?? `Alternativa ${selectedChoice + 1}`;
      return [
        {
          studyId: study.studyId,
          studyTitle: study.title,
          subject: study.subject,
          topic: study.title,
          source: "quiz" as const,
          sourceId: question.id,
          questionPrompt: question.question,
          wrongAnswer,
          correctAnswer: question.alternatives[question.correctAnswer],
          explanation: question.explanation,
        },
      ];
    });
    if (wrongEntries.length > 0) {
      void ErrorNotebookStorage.recordEntries(wrongEntries);
    }
    setIsFinished(true);
    savePractice({ index, answers, isFinished: true, mode });
  };

  const startAdaptiveSession = () => {
    const selection = AdaptiveAssessmentEngine.selectAdaptiveQuizQuestions({
      questions,
      results,
      errorEntries,
      knowledge: studyKnowledge,
      count: questionCount,
      mode: difficulty,
    });
    if (selection.selectedQuestions.length === 0) return;
    setAdaptiveQuestionIds(selection.selectedQuestions.map((q) => q.id));
    setAdaptiveReasons(selection.reasonsByQuestionId);
    setAdaptiveSummary(selection.summary);
    setIndex(0);
    setAnswers([]);
    setIsFinished(false);
    setShowConfig(false);
    savePractice({ index: 0, answers: [], isFinished: false, mode: "practice" });
  };

  const restart = () => {
    setIndex(0);
    setAnswers([]);
    setIsFinished(false);
    savePractice({ index: 0, answers: [], isFinished: false, mode });
  };

  const latestResult = results[0];
  const insight = KnowledgeEngine.quizInsight(results);

  return (
    <section aria-labelledby="quiz-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="quiz-workspace-title" className="text-lg font-semibold tracking-tight">Simulado & Quiz Explicado</h2>
          <p className="mt-1 text-sm text-muted-foreground">{mode === "practice" ? `${questions.length} questões disponíveis · Modo Prática` : "Questões geradas e corrigidas no servidor"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{indicator.reliabilityLabel} · {indicator.sampleSize} q.</Badge>
          <select aria-label="Modo do simulado" className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium" value={mode} onChange={(e) => { const nextMode = e.target.value as "practice" | "exam"; const current = WorkspacePersistence.load(study.studyId).quiz; setMode(nextMode); WorkspacePersistence.save(study.studyId, { quiz: { ...current, index, answers, isFinished, mode: nextMode } }); }}>
            <option value="practice">Modo Prática</option>
            <option value="exam">Modo Prova protegido</option>
          </select>
          {mode === "practice" && questions.length > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={startAdaptiveSession}>
              <Sparkles className="size-4 mr-1" /> Simulado adaptativo
            </Button>
          )}
          {mode === "practice" && (
            <Button type="button" variant="outline" onClick={() => setShowConfig(!showConfig)} disabled={isGenerating || !canGenerate}>
              <Plus className="size-4 mr-1" /> {isGenerating ? "Criando..." : "Novo Simulado"}
            </Button>
          )}
        </div>
      </div>

      {mode === "practice" && showConfig && (
        <Card className="p-4 border-primary/30 bg-card/60 space-y-3">
          <h3 className="text-sm font-semibold">Configurar Simulado</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs text-muted-foreground uppercase font-semibold">Quantidade</label>
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1" value={questionCount} onChange={(e) => setQuestionCount(Number(e.target.value))}>
                <option value={5}>5 questões</option>
                <option value={10}>10 questões</option>
                <option value={20}>20 questões</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground uppercase font-semibold">Dificuldade</label>
              <select aria-label="Dificuldade do simulado" className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value as AdaptiveDifficultyMode)}>
                <option value="adaptive">Adaptativa (recomendada)</option>
                <option value="easy">Fácil</option>
                <option value="medium">Média</option>
                <option value="hard">Difícil</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button className="w-full" onClick={() => {
                setShowConfig(false);
                const resolvedDifficulty = difficulty === "adaptive" ? indicator.recommendedDifficulty : difficulty;
                void generate(study, { count: Math.min(10, Math.max(3, questionCount)), difficulty: resolvedDifficulty });
              }}>Gerar com IA</Button>
            </div>
          </div>
        </Card>
      )}

      {mode === "exam" ? (
        <SecureExamPanel study={study} />
      ) : (
        <>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {!currentQuestion ? (
        <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none">
          <ClipboardCheck className="size-8 text-primary" />
          <h3 className="font-semibold">Simulados inteligentes com correção explicada</h3>
          <p className="text-sm text-muted-foreground max-w-md">Gere questões baseadas nos seus materiais para praticar no modo estudo ou realizar um simulado completo estilo prova.</p>
          <Button onClick={() => void generate(study)} disabled={isGenerating || !canGenerate}>Gerar primeiro simulado</Button>
        </Card>
      ) : isFinished ? (
        <Card className="items-center gap-5 p-6 sm:p-8 text-center shadow-none">
          <CheckCircle2 className="size-10 text-primary" />
          <div>
            <h3 className="text-xl font-bold">Quiz concluído</h3>
            <p className="text-sm text-muted-foreground mt-1">Correção e explicações detalhadas das questões.</p>
          </div>
          {latestResult && (
            <div className="grid w-full gap-3 sm:grid-cols-3 max-w-md">
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.correctAnswers}</strong><br /><span className="text-xs text-muted-foreground">Acertos</span></div>
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.wrongAnswers}</strong><br /><span className="text-xs text-muted-foreground">Erros</span></div>
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.score}%</strong><br /><span className="text-xs text-muted-foreground">Nota</span></div>
            </div>
          )}

          <div className="grid w-full gap-3 text-left sm:grid-cols-2">
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Evolução</p>
              <p className="mt-1 text-sm">{insight.comparison}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Ponto forte</p>
              <p className="mt-1 text-sm">{insight.strengths[0]}</p>
            </div>
            {insight.weaknesses.length > 0 ? (
              <div className="rounded-lg border p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Ponto fraco</p>
                <p className="mt-1 text-sm">{insight.weaknesses[0]}</p>
              </div>
            ) : null}
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Recomendação</p>
              <p className="mt-1 text-sm">{insight.recommendation}</p>
            </div>
          </div>

          <div className="w-full space-y-3 rounded-lg border bg-muted/20 p-4 text-left">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Indicador confiável &amp; Revisão inteligente</p>
              <Badge variant="outline">{indicator.reliabilityLabel} · {indicator.sampleSize} questões</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{indicator.disclaimer}</p>
            {indicator.nextReviewSteps.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {indicator.nextReviewSteps.map((step) => (
                  <Link key={step.id} href={step.href} className="rounded-lg border bg-background p-3 text-xs transition-colors hover:bg-accent">
                    <div className="flex items-center justify-between gap-2">
                      <strong className="text-foreground">{step.title}</strong>
                      <Badge variant="secondary">{step.priority}</Badge>
                    </div>
                    <p className="mt-1 text-muted-foreground">{step.description}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="w-full space-y-3 text-left">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Revisão Questão a Questão</h4>
            {activeQuestions.map((q, qIdx) => {
              const userAns = answers[qIdx];
              const correct = userAns === q.correctAnswer;
              return (
                <div key={q.id} className={`p-4 rounded-xl border text-sm space-y-2 ${correct ? "border-primary/30 bg-primary/5" : "border-destructive/30 bg-destructive/5"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">Questão {qIdx + 1}</span>
                    <Badge variant={correct ? "default" : "destructive"}>{correct ? "Acertou" : "Errou"}</Badge>
                  </div>
                  <p className="font-medium">{q.question}</p>
                  <p className="text-xs text-muted-foreground">Sua resposta: {userAns != null ? q.alternatives[userAns] : "Não respondida"} {correct ? "" : `(Correta: ${q.alternatives[q.correctAnswer]})`}</p>
                  <div className="p-3 rounded-lg bg-background/80 border text-xs leading-relaxed mt-2">
                    <strong className="text-foreground">Explicação: </strong>{q.explanation}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={restart}><RotateCcw className="size-4 mr-2" /> Refazer Simulado</Button>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {adaptiveSummary && (
            <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <span>{adaptiveSummary}</span>
              {adaptiveReasons[currentQuestion.id] && (
                <Badge variant="secondary">{adaptiveReasons[currentQuestion.id].reasons[0]}</Badge>
              )}
            </div>
          )}
          <QuizQuestion question={currentQuestion} selectedAnswer={answers[index] ?? null} onAnswer={(alt) => handleAnswer(index, alt)} />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => goToQuestion(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft className="size-4 mr-1" /> Anterior</Button>
            <span className="text-xs text-muted-foreground">Questão {index + 1} de {activeQuestions.length}</span>
            <Button type="button" size="sm" onClick={() => {
              if (index + 1 < activeQuestions.length) goToQuestion(index + 1);
              else submitExam();
            }}>
              {index + 1 === activeQuestions.length ? "Finalizar Simulado" : "Próxima"} <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {isGenerating && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> A IA está gerando o simulado fundamentado nos materiais...
        </p>
      )}
        </>
      )}
    </section>
  );
}
