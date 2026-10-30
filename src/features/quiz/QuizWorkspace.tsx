"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, LoaderCircle, Plus, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { StudyRecord } from "@/types/study-engine";
import { QuizService } from "./QuizService";
import { QuizQuestion } from "./QuizQuestion";
import { useQuiz } from "./useQuiz";
import { hasStructuredStudyContent } from "@/features/study/services/StudyEngine";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";
import { KnowledgeEngine } from "@/features/learning/KnowledgeEngine";

export function QuizWorkspace({ study }: { study: StudyRecord }) {
  const { questions, results, error, isGenerating, generate, saveResult } = useQuiz(study.studyId);
  const stored = WorkspacePersistence.load(study.studyId).quiz;
  const [index, setIndex] = useState(stored.index);
  const [answers, setAnswers] = useState<number[]>(stored.answers || []);
  const [isFinished, setIsFinished] = useState(stored.isFinished);
  const [mode, setMode] = useState<"practice" | "exam">("practice");
  const [showConfig, setShowConfig] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");

  useEffect(() => {
    if (questions.length > 0 && index >= questions.length) setIndex(0);
  }, [index, questions.length]);

  const currentQuestion = questions[index];
  const canGenerate = hasStructuredStudyContent(study);

  const handleAnswer = (questionIndex: number, alternativeIndex: number) => {
    const next = [...answers];
    next[questionIndex] = alternativeIndex;
    setAnswers(next);
    WorkspacePersistence.save(study.studyId, { quiz: { index, answers: next, isFinished } });
  };

  const submitExam = () => {
    const correct = questions.reduce((total, question, qIdx) => total + (answers[qIdx] === question.correctAnswer ? 1 : 0), 0);
    const wrong = questions.length - correct;
    saveResult(QuizService.createResult(study.studyId, questions.map((q) => q.id), correct, wrong));
    setIsFinished(true);
    WorkspacePersistence.save(study.studyId, { quiz: { index, answers, isFinished: true } });
  };

  const restart = () => {
    setIndex(0);
    setAnswers([]);
    setIsFinished(false);
    WorkspacePersistence.save(study.studyId, { quiz: { index: 0, answers: [], isFinished: false } });
  };

  const latestResult = results[0];
  const insight = KnowledgeEngine.quizInsight(results);

  return (
    <section aria-labelledby="quiz-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="quiz-workspace-title" className="text-lg font-semibold tracking-tight">Simulado & Quiz Explicado</h2>
          <p className="mt-1 text-sm text-muted-foreground">{questions.length} questões disponíveis · Modo {mode === "practice" ? "Prática" : "Prova"}</p>
        </div>
        <div className="flex items-center gap-2">
          <select className="rounded-md border bg-background px-3 py-1.5 text-xs font-medium" value={mode} onChange={(e) => setMode(e.target.value as "practice" | "exam")}>
            <option value="practice">Modo Prática</option>
            <option value="exam">Modo Prova</option>
          </select>
          <Button type="button" variant="outline" onClick={() => setShowConfig(!showConfig)} disabled={isGenerating || !canGenerate}>
            <Plus className="size-4 mr-1" /> {isGenerating ? "Criando..." : "Novo Simulado"}
          </Button>
        </div>
      </div>

      {showConfig && (
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
            <h3 className="text-xl font-bold">Simulado Finalizado</h3>
            <p className="text-sm text-muted-foreground mt-1">Correção e explicações detalhadas das questões.</p>
          </div>
          {latestResult && (
            <div className="grid w-full gap-3 sm:grid-cols-3 max-w-md">
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.correctAnswers}</strong><br /><span className="text-xs text-muted-foreground">Acertos</span></div>
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.wrongAnswers}</strong><br /><span className="text-xs text-muted-foreground">Erros</span></div>
              <div className="p-3 rounded-lg border bg-card/50"><strong>{latestResult.score}%</strong><br /><span className="text-xs text-muted-foreground">Nota</span></div>
            </div>
          )}

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
                  <p className="text-xs text-muted-foreground">Sua resposta: {userAns !== undefined ? q.alternatives[userAns] : "Não respondida"} {correct ? "" : `(Correta: ${q.alternatives[q.correctAnswer]})`}</p>
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
      ) : mode === "practice" ? (
        <div className="space-y-4">
          <QuizQuestion question={currentQuestion} selectedAnswer={answers[index] ?? null} onAnswer={(alt) => handleAnswer(index, alt)} />
          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}><ChevronLeft className="size-4 mr-1" /> Anterior</Button>
            <span className="text-xs text-muted-foreground">Questão {index + 1} de {questions.length}</span>
            <Button type="button" size="sm" onClick={() => {
              if (index + 1 < questions.length) setIndex((i) => i + 1);
              else submitExam();
            }}>
              {index + 1 === questions.length ? "Finalizar Simulado" : "Próxima"} <ChevronRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="p-6 space-y-4 shadow-none">
            <div className="flex items-center justify-between">
              <Badge variant="secondary">Questão {index + 1} de {questions.length}</Badge>
              <span className="text-xs text-muted-foreground">Modo Prova (Responda e finalize ao final)</span>
            </div>
            <h3 className="text-lg font-semibold">{currentQuestion.question}</h3>
            <div className="grid gap-2">
              {currentQuestion.alternatives.map((alt, altIdx) => {
                const selected = answers[index] === altIdx;
                return (
                  <Button
                    key={alt}
                    type="button"
                    variant="outline"
                    className={`h-auto min-h-11 justify-start whitespace-normal px-4 py-3 text-left ${selected ? "border-primary bg-primary/10 font-semibold" : ""}`}
                    onClick={() => handleAnswer(index, altIdx)}
                  >
                    <span className="mr-2 font-semibold">{"ABCD"[altIdx]}.</span>
                    {alt}
                  </Button>
                );
              })}
            </div>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" size="sm" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}><ChevronLeft className="size-4 mr-1" /> Anterior</Button>
            <div className="flex gap-1">
              {questions.map((_, qIdx) => (
                <button
                  key={qIdx}
                  type="button"
                  onClick={() => setIndex(qIdx)}
                  className={`size-7 rounded-lg text-xs font-semibold ${index === qIdx ? "bg-primary text-primary-foreground" : answers[qIdx] !== undefined ? "bg-accent text-accent-foreground border" : "border bg-card"}`}
                >
                  {qIdx + 1}
                </button>
              ))}
            </div>
            {index + 1 < questions.length ? (
              <Button type="button" size="sm" onClick={() => setIndex((i) => i + 1)}>Próxima <ChevronRight className="size-4 ml-1" /></Button>
            ) : (
              <Button type="button" size="sm" onClick={submitExam} className="bg-primary text-primary-foreground">Entregar Prova</Button>
            )}
          </div>
        </div>
      )}

      {isGenerating && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> A IA está gerando o simulado fundamentado nos materiais...
        </p>
      )}
    </section>
  );
}
