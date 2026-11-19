"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronLeft, ChevronRight, Mic, Pause, Play, RotateCcw, Send, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useAudioLesson, type AudioLessonOptions } from "../hooks/useAudioLesson";
import { prepareNarration } from "../services/TeacherNarrationService";
import type { TeacherRequest } from "../types";

interface NarratedLessonPanelProps {
  studyId: string;
  topic: string;
  subject: string;
  context?: string;
  teaching: TeacherRequest;
  options: AudioLessonOptions;
  onClose: () => void;
  onQuestion?: (question: string) => void;
  onAnswer?: (answer: string) => void;
}

export function NarratedLessonPanel({
  studyId,
  topic,
  subject,
  context,
  teaching,
  options,
  onClose,
  onQuestion,
  onAnswer,
}: NarratedLessonPanelProps) {
  const lesson = useAudioLesson();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [mode, setMode] = useState<"lesson" | "question" | "exercise">("lesson");
  const [correction, setCorrection] = useState<string | null>(null);
  const answerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "exercise") answerRef.current?.focus();
  }, [mode]);

  const step = lesson.currentStep;
  const narration = step ? prepareNarration(step.original) : null;
  const activeSegment = narration?.segments.find((segment) =>
    step ? segment.spoken.trim().startsWith(step.spoken.slice(0, 40).trim()) : false,
  ) ?? null;

  const handleStart = async () => {
    await lesson.start({ studyId, topic, subject, context, teaching, options });
  };

  const handleAsk = async () => {
    const text = question.trim();
    if (!text) return;
    await lesson.ask(text);
    onQuestion?.(text);
    setQuestion("");
    setMode("lesson");
  };

  const handleAnswer = async () => {
    const text = answer.trim();
    if (!text) return;
    setMode("lesson");
    const result = await lesson.answerExercise(text);
    if (result?.suggestedText) setCorrection(result.suggestedText);
    setAnswer("");
    onAnswer?.(text);
  };

  const total = lesson.session?.steps.length ?? 0;
  const current = lesson.session?.currentStep ?? 0;

  return (
    <section aria-label="Aula narrada" className="mb-4 rounded-2xl border bg-card/60 p-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Aula narrada</h2>
            {lesson.session && (
              <Badge variant="outline" className="text-[11px]">
                Etapa {current + 1} de {total}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{topic}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={lesson.session?.narrationEnabled === false ? "ghost" : "secondary"}
            onClick={() => void lesson.setNarrationEnabled(lesson.session?.narrationEnabled === false)}
            disabled={!lesson.session}
            aria-label={lesson.session?.narrationEnabled === false ? "Ativar narração" : "Desativar narração"}
          >
            {lesson.session?.narrationEnabled === false ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => { void lesson.end(); onClose(); }}>
            Encerrar
          </Button>
        </div>
      </header>

      {lesson.error && (
        <p role="alert" className="mb-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
          {lesson.error}
        </p>
      )}

      {!lesson.session && (
        <div className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-medium">Preparar aula narrada</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            O Professor vai dividir <strong>{topic}</strong> em etapas narradas, com exemplos e um exercício.
          </p>
          <Button type="button" size="sm" className="mt-3" onClick={() => void handleStart()} disabled={lesson.status === "planning"}>
            {lesson.status === "planning" ? "Preparando..." : "Iniciar aula narrada"}
          </Button>
        </div>
      )}

      {lesson.session && step && (
        <div className="space-y-3">
          <Progress value={((current + 1) / total) * 100} className="h-1.5" aria-label="Progresso da aula" />

          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">{step.title}</p>
              <Badge variant="secondary" className="text-[10px] capitalize">{step.kind}</Badge>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{step.original}</p>
            {activeSegment && (
              <p className="mt-2 border-t pt-2 text-xs italic text-muted-foreground">
                {activeSegment.spoken}
              </p>
            )}
          </div>

          {step.exercisePrompt && !step.exerciseResolved && mode !== "exercise" && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-sm font-medium">Exercício da etapa</p>
              <p className="mt-1 text-sm leading-6">{step.exercisePrompt}</p>
              <Button type="button" size="sm" className="mt-2" onClick={() => setMode("exercise")}>
                Responder exercício
              </Button>
            </div>
          )}

          {mode === "exercise" && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <label className="text-sm font-medium" htmlFor="audio-lesson-answer">Sua resposta</label>
              <textarea
                id="audio-lesson-answer"
                ref={answerRef}
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                rows={3}
                placeholder="Escreva sua resposta..."
                className="min-h-20 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void handleAnswer()} disabled={!answer.trim() || lesson.isCorrecting}>
                  <Send className="size-3.5 me-1" aria-hidden="true" />
                  {lesson.isCorrecting ? "Corrigindo..." : "Enviar resposta"}
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("lesson")}>Cancelar</Button>
              </div>
            </div>
          )}

          {mode === "question" && (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
              <label className="text-sm font-medium" htmlFor="audio-lesson-question">Sua pergunta</label>
              <textarea
                id="audio-lesson-question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                rows={2}
                placeholder="O que ficou duvidoso?"
                className="min-h-16 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void handleAsk()} disabled={!question.trim()}>
                  <Send className="size-3.5 me-1" aria-hidden="true" />Enviar pergunta
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setMode("lesson")}>Cancelar</Button>
              </div>
            </div>
          )}

          {correction && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-primary">Correção do Professor</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{correction}</p>
            </div>
          )}

          {lesson.lastAlternative && (
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground">Explicação alternativa</p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{lesson.lastAlternative}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              type="button"
              size="icon"
              variant={lesson.status === "speaking" ? "destructive" : "secondary"}
              onClick={() => void (lesson.status === "speaking" ? lesson.pauseNarration() : lesson.narrate())}
              aria-label={lesson.status === "speaking" ? "Pausar narração" : "Narrar etapa"}
            >
              {lesson.status === "speaking" ? <Pause className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void lesson.stopNarration()}
              aria-label="Parar narração"
            >
              <Square className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void lesson.repeatStep()}
              aria-label="Repetir explicação"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void lesson.previousStep()}
              disabled={current === 0}
              aria-label="Etapa anterior"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              onClick={() => void lesson.nextStep()}
              disabled={current >= total - 1}
              aria-label="Próxima etapa"
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setMode("question")}
            >
              <Mic className="size-3.5 me-1" aria-hidden="true" />Fazer pergunta
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void lesson.explainDifferently()}
              disabled={lesson.status === "questioning"}
            >
              <RotateCcw className="size-3.5 me-1" aria-hidden="true" />Explicar de outra forma
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
