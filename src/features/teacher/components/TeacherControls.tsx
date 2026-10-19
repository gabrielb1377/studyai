"use client";

import { useState } from "react";

import {
  BookOpenCheck,
  BrainCircuit,
  GitCompareArrows,
  GitFork,
  GraduationCap,
  ListChecks,
  Mic,
  MicOff,
  Network,
  Play,
  Pause,
  Quote,
  Route,
  Sparkles,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  SkipBack,
  SkipForward,
  Send,
  X,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TutorStudyContext } from "@/types/tutor-context";
import {
  teacherLevelLabels,
  teacherLevels,
  teacherMethodLabels,
  teacherMethods,
  teacherSummaryStyleLabels,
  teacherSummaryStyles,
  type TeacherAction,
  type TeacherMaterialSelection,
  type TeacherPreferences,
  type RateOption,
} from "../types";
import { TeacherAudioPlayer } from "./TeacherAudioPlayer";
import { VoiceInput } from "@/features/voice/components/VoiceInput";

const tools: Array<{ action: TeacherAction; label: string; icon: typeof Route }> = [
  { action: "lesson_plan", label: "Plano de aula", icon: ListChecks },
  { action: "flowchart", label: "Fluxograma", icon: GitFork },
  { action: "mind_map", label: "Mapa mental", icon: Network },
  { action: "timeline", label: "Linha do tempo", icon: Route },
  { action: "exercise", label: "Exercício", icon: BookOpenCheck },
  { action: "compare", label: "Comparar conceitos", icon: GitCompareArrows },
  { action: "audio_lesson", label: "Aula narrada", icon: Mic },
];

interface TeacherControlsProps {
  context: TutorStudyContext | null;
  disabled: boolean;
  preferences: TeacherPreferences;
  audioPreferences: {
    voice: string;
    rate: RateOption;
    autoplay: boolean;
  };
  selection: TeacherMaterialSelection | null;
  audioLessonMode: "idle" | "active" | "paused";
  audioLessonSession: {
    sessionId: string;
    topic: string;
    plan: string[];
    currentStep: number;
    completedSteps: number[];
  } | null;
  onPreferencesChange: (changes: Partial<TeacherPreferences>) => void;
  onAudioPreferencesChange: (changes: Partial<{ voice: string; rate: RateOption; autoplay: boolean }>) => void;
  onAction: (action: TeacherAction) => void;
  onClearSelection: () => void;
  onStartAudioLesson: (topic: string, plan: string[]) => void;
  onAdvanceStep: () => void;
  onPreviousStep: () => void;
  onRepeatStep: () => void;
  onPlayPause: () => void;
  onStop: () => void;
  onPauseLesson: () => void;
  onResumeLesson: () => void;
  onEndLesson: () => void;
  onVoiceQuestion: (question: string) => void;
}

export function TeacherControls({
  context,
  disabled,
  preferences,
  audioPreferences,
  selection,
  audioLessonMode,
  audioLessonSession,
  onPreferencesChange,
  onAudioPreferencesChange,
  onAction,
  onClearSelection,
  onStartAudioLesson,
  onAdvanceStep,
  onPreviousStep,
  onRepeatStep,
  onPlayPause,
  onStop,
  onPauseLesson,
  onResumeLesson,
  onEndLesson,
  onVoiceQuestion,
}: TeacherControlsProps) {
  const isAudioLessonActive = audioLessonMode === "active" && audioLessonSession;
  const isPlaying = audioLessonMode === "active";
  const isPaused = audioLessonMode === "paused";
  const [showVoiceInput, setShowVoiceInput] = useState(false);

  // Generate a lesson plan for audio lesson
  const handleStartAudioLesson = () => {
    if (!context) return;
    // Create a default plan based on the topic
    const topic = context.topic || "o tema atual";
    const plan = [
      `Introdução e objetivos: ${topic}`,
      "Explicação conceitual fundamental",
      "Exemplos práticos do material",
      "Exercício proposto",
      "Correção e feedback",
      "Resumo e próxima etapa",
    ];
    onStartAudioLesson(topic, plan);
  };

  const handleVoiceQuestion = (question: string) => {
    if (onVoiceQuestion) {
      onVoiceQuestion(question);
    }
    // After sending a question, hide the voice input
    setShowVoiceInput(false);
  };

  if (isAudioLessonActive && audioLessonSession) {
    return (
      <div aria-label="Player de Aula Narrada" className="mb-4">
        <TeacherAudioPlayer
          text={audioLessonSession.plan[audioLessonSession.currentStep]}
          stepIndex={audioLessonSession.currentStep}
          totalSteps={audioLessonSession.plan.length}
          onPlayPause={onPlayPause}
          onStop={onStop}
          onNextStep={onAdvanceStep}
          onPrevStep={onPreviousStep}
          onRepeat={onRepeatStep}
          onRateChange={(rate) => onAudioPreferencesChange({ rate })}
          onVoiceChange={(voice) => onAudioPreferencesChange({ voice })}
          onToggleAutoplay={(enabled) => onAudioPreferencesChange({ autoplay: enabled })}
          isPlaying={isPlaying}
          isPaused={isPaused}
          currentRate={audioPreferences.rate}
          currentVoice={audioPreferences.voice}
          autoplay={audioPreferences.autoplay}
          disabled={disabled}
        />

        {/* Voice Input for asking questions during the lesson */}
        <div className="mt-3 space-y-3">
          {!showVoiceInput && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowVoiceInput(true)}
              disabled={disabled}
              className="w-full"
            >
              <Mic className="size-3.5 me-1" aria-hidden="true" />
              Fazer pergunta por voz
            </Button>
          )}
          {showVoiceInput && (
            <VoiceInput
              onSendMessage={handleVoiceQuestion}
              disabled={disabled}
              placeholder="Pergunte algo sobre a explicação atual..."
              context={audioLessonSession.plan[audioLessonSession.currentStep]}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <aside aria-label="Controles do Professor" className="mb-4 rounded-xl border bg-secondary/20 p-3 sm:p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <GraduationCap className="size-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold">Professor adaptativo</p>
            {context?.learning && <Badge variant="outline">Nível atual: {context.learning.mastery}</Badge>}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            A aula reutiliza o material recuperado, o Learning Engine e o mapa de conhecimento.
          </p>
        </div>
        <Button type="button" size="sm" onClick={() => onAction("guided_lesson")} disabled={disabled || !context}>
          <Sparkles aria-hidden="true" />Ensine-me este tema
        </Button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Explicar como
          <select
            aria-label="Nível da explicação"
            value={preferences.level}
            onChange={(event) => onPreferencesChange({ level: event.target.value as TeacherPreferences["level"] })}
            className="block h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {teacherLevels.map((level) => <option key={level} value={level}>{teacherLevelLabels[level]}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-muted-foreground">
          Método de ensino
          <select
            aria-label="Método de ensino"
            value={preferences.method}
            onChange={(event) => onPreferencesChange({ method: event.target.value as TeacherPreferences["method"] })}
            className="block h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            {teacherMethods.map((method) => <option key={method} value={method}>{teacherMethodLabels[method]}</option>)}
          </select>
        </label>
      </div>

      <details className="group mt-3 rounded-lg border bg-background/60">
        <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium">
          <BrainCircuit className="size-3.5 text-primary" aria-hidden="true" />Ferramentas de aula
          <span className="ml-auto text-muted-foreground group-open:hidden">Abrir</span>
          <span className="ml-auto hidden text-muted-foreground group-open:inline">Fechar</span>
        </summary>
        <div className="grid gap-2 border-t p-3 sm:grid-cols-2 xl:grid-cols-3">
          {tools.map(({ action, label, icon: Icon }) => (
            <Button key={action} type="button" variant="outline" size="sm" className="justify-start" disabled={disabled || !context} onClick={() => onAction(action)}>
              <Icon aria-hidden="true" />{label}
            </Button>
          ))}
          <label className="flex min-w-0 items-center gap-2 rounded-md border bg-background px-2 sm:col-span-2 xl:col-span-3">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Resumo</span>
            <select
              aria-label="Formato do resumo adaptativo"
              value={preferences.summaryStyle}
              onChange={(event) => onPreferencesChange({ summaryStyle: event.target.value as TeacherPreferences["summaryStyle"] })}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
            >
              {teacherSummaryStyles.map((style) => <option key={style} value={style}>{teacherSummaryStyleLabels[style]}</option>)}
            </select>
            <Button type="button" variant="ghost" size="sm" disabled={disabled || !context} onClick={() => onAction("adaptive_summary")}>Gerar</Button>
          </label>
        </div>
      </details>

      {/* Audio Lesson Controls - shown when not in active audio lesson */}
      {!isAudioLessonActive && context && (
        <div className="mt-3 rounded-lg border bg-primary/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Mic className="size-4 text-primary" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Aula Narrada</p>
                <p className="text-xs text-muted-foreground">O Professor explica, exemplifica e propõe exercícios com narração em áudio</p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={handleStartAudioLesson}
              disabled={disabled}
            >
              <Play className="size-3.5 me-1" aria-hidden="true" />Iniciar Aula Narrada
            </Button>
          </div>
        </div>
      )}

      {selection && (
        <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
          <div className="flex items-start gap-2">
            <Quote className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">Trecho selecionado</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{selection.text}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {[selection.sourceName, selection.page ? `página ${selection.page}` : undefined, selection.chapter].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-1">
              <Button type="button" size="sm" disabled={disabled} onClick={() => onAction("explain_selection")}>Explicar este trecho</Button>
              <Button type="button" variant="ghost" size="sm" onClick={onClearSelection}>Limpar</Button>
            </div>
          </div>
        </div>
      )}

      {/* Audio Lesson Session Controls - shown when lesson was started but paused */}
      {audioLessonSession && isPaused && (
        <div className="mt-3 rounded-lg border bg-amber/5 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Pause className="size-4 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Aula pausada</p>
                <p className="text-xs text-muted-foreground">Etapa {audioLessonSession.currentStep + 1} de {audioLessonSession.plan.length}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="secondary" onClick={onResumeLesson} disabled={disabled}>
                <Play className="size-3.5 me-1" aria-hidden="true" />Continuar
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={onEndLesson} disabled={disabled}>
                <span className="size-3.5 me-1" aria-hidden="true">⏹</span>Encerrar
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
