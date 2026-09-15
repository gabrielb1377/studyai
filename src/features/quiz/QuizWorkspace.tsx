"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { StudyRecord } from "@/types/study-engine";
import { QuizService } from "./QuizService";
import { QuizQuestion } from "./QuizQuestion";
import { useQuiz } from "./useQuiz";

export function QuizWorkspace({ study }: { study: StudyRecord }) {
  const { questions, results, error, isGenerating, generate, saveResult } = useQuiz(study.studyId);
  const [index, setIndex] = useState(0); const [answers, setAnswers] = useState<number[]>([]); const [isFinished, setIsFinished] = useState(false);
  useEffect(() => { if (index >= questions.length) setIndex(0); }, [index, questions.length]);
  const currentQuestion = questions[index];
  const answer = (selected: number) => { const next = [...answers, selected]; setAnswers(next); };
  const next = () => { if (index + 1 < questions.length) setIndex((current) => current + 1); else { const correct = questions.reduce((total, question, questionIndex) => total + (answers[questionIndex] === question.correctAnswer ? 1 : 0), 0); saveResult(QuizService.createResult(study.studyId, questions.map((question) => question.id), correct, questions.length - correct)); setIsFinished(true); } };
  const restart = () => { setIndex(0); setAnswers([]); setIsFinished(false); };
  const latestResult = results[0];
  return <section aria-labelledby="quiz-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="quiz-workspace-title" className="text-lg font-semibold tracking-tight">Quiz</h2><p className="mt-1 text-sm text-muted-foreground">{questions.length} questões disponíveis</p></div><Button type="button" variant="outline" onClick={() => { void generate(study); }} disabled={isGenerating}><Plus className="size-4" />{isGenerating ? "Criando..." : "Criar quiz"}</Button></div>{error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}{!currentQuestion ? <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none"><ClipboardCheck className="size-8 text-primary" /><h3 className="font-semibold">Teste seus conhecimentos</h3><p className="text-sm text-muted-foreground">Crie um quiz para praticar {study.title}.</p></Card> : isFinished && latestResult ? <Card className="items-center gap-4 p-8 text-center shadow-none"><CheckCircle2 className="size-10 text-primary" /><h3 className="text-xl font-semibold">Quiz concluído</h3><div className="grid w-full gap-3 sm:grid-cols-3"><p><strong>{latestResult.correctAnswers}</strong><br /><span className="text-xs text-muted-foreground">Acertos</span></p><p><strong>{latestResult.wrongAnswers}</strong><br /><span className="text-xs text-muted-foreground">Erros</span></p><p><strong>{latestResult.score}%</strong><br /><span className="text-xs text-muted-foreground">Aproveitamento</span></p></div><Button type="button" onClick={restart}>Refazer quiz</Button></Card> : <><QuizQuestion question={currentQuestion} selectedAnswer={answers[index] ?? null} onAnswer={answer} /><div className="flex items-center justify-between gap-3"><span className="text-xs text-muted-foreground">{index + 1} de {questions.length}</span><Button type="button" onClick={next} disabled={answers[index] === undefined}>{index + 1 === questions.length ? "Finalizar" : "Próxima"}</Button></div></>}{isGenerating && <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />A IA está preparando as questões...</p>}</section>;
}
