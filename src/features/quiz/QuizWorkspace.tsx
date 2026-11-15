"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, LoaderCircle, Plus, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudyRecord } from "@/types/study-engine";
import { QuizService } from "./QuizService";
import { QuizQuestion } from "./QuizQuestion";
import { SecureExamPanel } from "./SecureExamPanel";
import { useQuiz } from "./useQuiz";
import { hasStructuredStudyContent } from "@/features/study/services/StudyEngine";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";
import { ErrorNotebookStorage } from "@/features/learning/errors/ErrorNotebookStorage";
import type { CreateErrorEntryInput } from "@/features/learning/errors/types";


export function QuizWorkspace({ study }: { study: StudyRecord }) {
  const { questions, results, error, isGenerating, generate, saveResult } = useQuiz(study.studyId);
  const stored = WorkspacePersistence.load(study.studyId).quiz;
  const [index, setIndex] = useState(stored.index);
  const [answers, setAnswers] = useState<Array<number | null>>(stored.answers || []);
  const [isFinished, setIsFinished] = useState(stored.isFinished);
  const [mode, setMode] = useState<"practice" | "exam">(stored.mode ?? "practice");
  const [showConfig, setShowConfig] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  useEffect(() => {
    if (questions.length > 0 && index >= questions.length) setIndex(0);
  }, [index, questions.length]);

  const currentQuestion = questions[index];
  const canGenerate = hasStructuredStudyContent(study);

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
    const correct = questions.reduce((total, question, qIdx) => total + (answers[qIdx] === question.correctAnswer ? 1 : 0), 0);
    const wrong = questions.length - correct;
    saveResult(QuizService.createResult(study.studyId, questions.map((q) => q.id), correct, wrong));
    const wrongEntries: CreateErrorEntryInput[] = questions.flatMap((question, qIdx) => {
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
        <div className="flex items-center gap-2">
          <select aria-label="Modo do simulado" className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium" value={mode} onChange={(e) => { const nextMode = e.target.value as "practice" | "exam"; const current = WorkspacePersistence.load(study.studyId).quiz; setMode(nextMode); WorkspacePersistence.save(study.studyId, { quiz: { ...current, index, answers, isFinished, mode: nextMode } }); }}>
            <option value="practice">Modo Prática</option>
            <option value="exam">Modo Prova protegido</option>
          </select>
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
              <select className="w-full rounded-md border bg-background px-3 py-2 text-sm mt-1" value={difficulty} onChange={(e) => setDifficulty(e.target.value as "easy" | "medium" | "hard")}>
                <option value="easy">Fácil</option>
                <option value="medium">Média</option>
                <option value="hard">Difícil</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button className="w-full" onClick={() => { setShowConfig(false); void generate(study); }}>Gerar com IA</Button>
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

          <div className="w-full space-y-3 text-left">
            <h4 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">Revisão Questão a Questão</h4>
            {questions.map((q, qIdx) => {
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
          <QuizQuestion question={currentQuestion} selectedAnswer={answers[index] ?? null} onAnswer={(alt) => handleAnswer(index, alt)} />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => goToQuestion(Math.max(0, index - 1))} disabled={index === 0}><ChevronLeft className="size-4 mr-1" /> Anterior</Button>
            <span className="text-xs text-muted-foreground">Questão {index + 1} de {questions.length}</span>
            <Button type="button" size="sm" onClick={() => {
              if (index + 1 < questions.length) goToQuestion(index + 1);
              else submitExam();
            }}>
              {index + 1 === questions.length ? "Finalizar Simulado" : "Próxima"} <ChevronRight className="size-4 ml-1" />
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
