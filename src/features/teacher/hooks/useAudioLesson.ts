"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoice } from "@/features/voice/hooks/useVoice";
import { LearningService } from "@/features/learning/LearningService";
import {
  TeacherAudioSessionStorage,
  accumulateActiveSeconds,
  TEACHER_AUDIO_SESSION_EVENT,
  type TeacherAudioLessonStep,
  type TeacherAudioSession,
} from "../services/TeacherAudioSessionStorage";
import {
  TeacherAudioLessonClient,
  type NarratedLessonPlan,
} from "../services/TeacherAudioLessonClient";
import { prepareNarration } from "../services/TeacherNarrationService";
import type { TeacherRequest } from "../types";

export type AudioLessonStatus =
  | "idle"
  | "planning"
  | "ready"
  | "speaking"
  | "paused"
  | "questioning"
  | "correcting"
  | "error";

export type AudioLessonOptions = {
  voice: string;
  rate: number;
  autoplay: boolean;
  narrationEnabled: boolean;
};

export function useAudioLesson() {
  const { speak, pause, stop, status: voiceStatus } = useVoice();
  const [status, setStatus] = useState<AudioLessonStatus>("idle");
  const [session, setSession] = useState<TeacherAudioSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [lastAlternative, setLastAlternative] = useState<string | null>(null);
  const sessionRef = useRef<TeacherAudioSession | null>(null);

  sessionRef.current = session;

  useEffect(() => {
    let cancelled = false;
    void TeacherAudioSessionStorage.load().then((loaded) => {
      if (cancelled || !loaded) return;
      setSession(loaded);
      setStatus("paused");
      setActiveStepId(loaded.steps[loaded.currentStep]?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<TeacherAudioSession | null>).detail;
      setSession(detail);
    };
    window.addEventListener(TEACHER_AUDIO_SESSION_EVENT, handle);
    return () => window.removeEventListener(TEACHER_AUDIO_SESSION_EVENT, handle);
  }, []);

  const persist = useCallback(async (next: TeacherAudioSession) => {
    setSession(next);
    sessionRef.current = next;
    await TeacherAudioSessionStorage.save(next);
  }, []);

  const currentStep = session?.steps[session.currentStep] ?? null;

  /** Inicia uma nova aula narrada, gerando o plano com o Professor. */
  const start = useCallback(async (input: {
    studyId: string;
    topic: string;
    subject: string;
    context?: string;
    teaching: TeacherRequest;
    options: AudioLessonOptions;
  }) => {
    setStatus("planning");
    setError(null);
    try {
      const plan: NarratedLessonPlan = await TeacherAudioLessonClient.plan({
        topic: input.topic,
        context: input.context,
        teaching: input.teaching,
      });
      if (plan.steps.length === 0) throw new Error("O Professor não retornou etapas para a aula.");

      const nowIso = new Date().toISOString();
      const steps: TeacherAudioLessonStep[] = plan.steps.map((step) => ({
        id: crypto.randomUUID(),
        title: step.title,
        spoken: step.spoken,
        original: step.original,
        kind: step.kind,
        completed: false,
        exercisePrompt: step.exercisePrompt,
        exerciseResolved: false,
      }));

      const next: TeacherAudioSession = {
        id: crypto.randomUUID(),
        studyId: input.studyId,
        topic: input.topic,
        subject: input.subject,
        steps,
        currentStep: 0,
        startedAt: nowIso,
        updatedAt: nowIso,
        activeSeconds: 0,
        lastTickAt: null,
        voice: input.options.voice,
        rate: input.options.rate,
        autoplay: input.options.autoplay,
        narrationEnabled: input.options.narrationEnabled,
      };
      await persist(next);
      setActiveStepId(steps[0]?.id ?? null);
      setStatus("ready");
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Não foi possível preparar a aula narrada.";
      setError(message);
      setStatus("error");
      return null;
    }
  }, [persist]);

  /** Narra a etapa atual (ou a texto fornecido). */
  const narrate = useCallback(async (text?: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const target = text ?? current.steps[current.currentStep]?.spoken;
    if (!target?.trim()) return;

    if (!current.narrationEnabled) {
      setStatus("ready");
      return;
    }

    setStatus("speaking");
    const nowIso = new Date().toISOString();
    await persist({ ...current, lastTickAt: nowIso, activeSeconds: accumulateActiveSeconds(current, nowIso) });

    try {
      await speak(target, { rate: current.rate, voice: current.voice });
      setStatus("ready");
    } catch {
      setStatus("ready");
    }
  }, [persist, speak]);

  const pauseNarration = useCallback(async () => {
    await pause();
    const current = sessionRef.current;
    if (current) {
      const nowIso = new Date().toISOString();
      await persist({ ...current, activeSeconds: accumulateActiveSeconds(current, nowIso), lastTickAt: null });
    }
    setStatus("paused");
  }, [pause, persist]);

  const resumeNarration = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const nowIso = new Date().toISOString();
    await persist({ ...current, lastTickAt: nowIso });
    setStatus("ready");
    await narrate();
  }, [narrate, persist]);

  const stopNarration = useCallback(async () => {
    await stop();
    const current = sessionRef.current;
    if (current) {
      const nowIso = new Date().toISOString();
      await persist({ ...current, activeSeconds: accumulateActiveSeconds(current, nowIso), lastTickAt: null });
    }
    setStatus("ready");
  }, [stop, persist]);

  /** Avança para a próxima etapa, marcando a atual como concluída. */
  const nextStep = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    const steps = current.steps.map((step, index) =>
      index === current.currentStep ? { ...step, completed: true } : step,
    );
    if (current.currentStep >= steps.length - 1) {
      await persist({ ...current, steps, lastTickAt: null });
      setStatus("ready");
      await LearningService.enqueueActivity({
        type: "reading",
        studyId: current.studyId,
        chapter: current.topic,
        durationMinutes: Math.max(1, Math.round(current.activeSeconds / 60)),
        occurredAt: new Date().toISOString(),
      });
      return;
    }
    const nextIndex = current.currentStep + 1;
    await persist({ ...current, steps, currentStep: nextIndex, lastTickAt: null });
    setActiveStepId(steps[nextIndex]?.id ?? null);
    setStatus("ready");
    if (current.autoplay) await narrate(steps[nextIndex]?.spoken);
  }, [narrate, persist]);

  const previousStep = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.currentStep === 0) return;
    const previousIndex = current.currentStep - 1;
    await persist({ ...current, currentStep: previousIndex, lastTickAt: null });
    setActiveStepId(current.steps[previousIndex]?.id ?? null);
    setStatus("ready");
  }, [persist]);

  const repeatStep = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    setStatus("ready");
    await narrate(current.steps[current.currentStep]?.spoken);
  }, [narrate]);

  /** Envia uma pergunta (por voz ou texto) sem perder a etapa atual. */
  const ask = useCallback(async (question: string) => {
    const current = sessionRef.current;
    if (!current) return null;
    await stopNarration();
    setStatus("questioning");
    return question.trim();
  }, [stopNarration]);

  /** Registra a resposta do aluno a um exercício e pede a correção. */
  const answerExercise = useCallback(async (answer: string) => {
    const current = sessionRef.current;
    if (!current) return null;
    const step = current.steps[current.currentStep];
    if (!step?.exercisePrompt) return null;

    setIsCorrecting(true);
    setStatus("correcting");
    try {
      const teaching: TeacherRequest = {
        mode: "teacher",
        action: "dialogue",
        level: "intermediate",
        method: "step_by_step",
        summaryStyle: "medium",
      };
      const correction = await TeacherAudioLessonClient.correction({
        question: step.exercisePrompt,
        studentAnswer: answer,
        teaching,
      });

      const steps = current.steps.map((item, index) =>
        index === current.currentStep
          ? {
              ...item,
              exerciseResolved: true,
              exerciseAnswer: answer,
              spoken: `${item.spoken} ${correction.suggestedText}`,
            }
          : item,
      );
      const nowIso = new Date().toISOString();
      await persist({
        ...current,
        steps,
        lastTickAt: nowIso,
        activeSeconds: accumulateActiveSeconds(current, nowIso),
      });
      setStatus("ready");
      setIsCorrecting(false);

      await LearningService.enqueueActivity({
        type: "quiz",
        studyId: current.studyId,
        chapter: current.topic,
        durationMinutes: Math.max(1, Math.round(current.activeSeconds / 60)),
        correctAnswers: correction.correct ? 1 : 0,
        wrongAnswers: correction.correct ? 0 : 1,
        occurredAt: nowIso,
      });

      if (current.narrationEnabled) await narrate(steps[current.currentStep]?.spoken);
      return correction;
    } catch (cause) {
      setIsCorrecting(false);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Não foi possível corrigir a resposta.");
      return null;
    }
  }, [narrate, persist]);

  /** Gera uma explicação alternativa para a etapa atual. */
  const explainDifferently = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return null;
    const step = current.steps[current.currentStep];
    if (!step) return null;

    setStatus("questioning");
    try {
      const teaching: TeacherRequest = {
        mode: "teacher",
        action: "explain_differently",
        level: "intermediate",
        method: "analogies",
        summaryStyle: "medium",
      };
      const alternative = await TeacherAudioLessonClient.alternative({
        topic: current.topic,
        previousExplanation: step.original,
        teaching,
      });
      setLastAlternative(alternative);
      setStatus("ready");
      if (current.narrationEnabled) await narrate(alternative);
      return alternative;
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar outra explicação.");
      return null;
    }
  }, [narrate]);

  /** Encerra a aula, preservando o histórico no Learning Engine. */
  const end = useCallback(async () => {
    const current = sessionRef.current;
    await stopNarration();
    if (current) {
      await LearningService.enqueueActivity({
        type: "reading",
        studyId: current.studyId,
        chapter: current.topic,
        durationMinutes: Math.max(1, Math.round(current.activeSeconds / 60)),
        occurredAt: new Date().toISOString(),
      });
    }
    await TeacherAudioSessionStorage.remove();
    setSession(null);
    setStatus("idle");
    setActiveStepId(null);
  }, [stopNarration]);

  /** Ativa ou desativa a narração sem perder a etapa. */
  const setNarrationEnabled = useCallback(async (enabled: boolean) => {
    const current = sessionRef.current;
    if (!current) return;
    if (!enabled) await stop();
    await persist({ ...current, narrationEnabled: enabled });
  }, [persist, stop]);

  /** Prepara um texto arbitrário (ex.: seleção de PDF) para narração. */
  const narrateSelection = useCallback(async (text: string) => {
    const narration = prepareNarration(text);
    if (!narration.spokenText) return null;
    const current = sessionRef.current;
    if (current?.narrationEnabled === false) return narration.spokenText;
    setStatus("speaking");
    try {
      await speak(narration.spokenText, { rate: current?.rate, voice: current?.voice });
    } catch {
      // Falha de TTS não impede a leitura do texto na tela.
    }
    setStatus("ready");
    return narration.spokenText;
  }, [speak]);

  return {
    status,
    session,
    currentStep,
    activeStepId,
    error,
    isCorrecting,
    lastAlternative,
    isSpeaking: voiceStatus.isSpeaking,
    start,
    narrate,
    narrateSelection,
    pauseNarration,
    resumeNarration,
    stopNarration,
    nextStep,
    previousStep,
    repeatStep,
    ask,
    answerExercise,
    explainDifferently,
    setNarrationEnabled,
    end,
    clearError: () => setError(null),
  };
}
