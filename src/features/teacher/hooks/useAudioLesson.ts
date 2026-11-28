"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/account/AuthProvider";
import { SessionChangedError, SessionOperationManager } from "@/features/account/SessionOperationManager";
import { currentDatabaseGeneration, currentDatabaseName } from "@/lib/storage/Database";
import { useVoice } from "@/features/voice/hooks/useVoice";
import { LearningService } from "@/features/learning/LearningService";
import {
  TeacherAudioSessionStorage,
  accumulateActiveSeconds,
  TEACHER_AUDIO_SESSION_EVENT,
  type ExpectedAudioSessionContext,
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

type CapturedOperation = {
  readonly context: ExpectedAudioSessionContext;
  readonly assertStillCurrent: () => void;
  readonly release: () => void;
};

function startBoundSessionOperation(expectedOwnerId?: string): CapturedOperation {
  const op = SessionOperationManager.start(expectedOwnerId);
  const databaseGeneration = currentDatabaseGeneration();
  const databaseName = currentDatabaseName();
  const context: ExpectedAudioSessionContext = {
    userId: op.userId,
    generation: op.generation,
  };
  return {
    context,
    assertStillCurrent() {
      op.assertCurrent();
      if (currentDatabaseGeneration() !== databaseGeneration || currentDatabaseName() !== databaseName) {
        throw new SessionChangedError("O armazenamento da conta mudou durante a operação de aula em áudio.");
      }
    },
    release() {
      op.release();
    },
  };
}

export function useAudioLesson() {
  const auth = useAuth();
  const runtimeSession = SessionOperationManager.current();
  const activeOwnerId =
    !auth.isLoading && !runtimeSession.suspended && runtimeSession.userId
      ? auth.session?.user.id && auth.session.user.id !== runtimeSession.userId
        ? null
        : runtimeSession.userId
      : null;
  const activeSessionKey = activeOwnerId ? `${activeOwnerId}:${runtimeSession.generation}` : null;

  const { speak, pause, stop, status: voiceStatus } = useVoice();
  const [status, setStatus] = useState<AudioLessonStatus>("idle");
  const [session, setSession] = useState<TeacherAudioSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCorrecting, setIsCorrecting] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [lastAlternative, setLastAlternative] = useState<string | null>(null);
  const sessionRef = useRef<TeacherAudioSession | null>(null);
  const activeOwnerRef = useRef<string | null>(activeOwnerId);

  sessionRef.current = session;
  activeOwnerRef.current = activeOwnerId;

  useEffect(() => {
    let cancelled = false;
    // Limpa imediatamente estado em memória em qualquer transição, logout ou troca A->B
    sessionRef.current = null;
    setSession(null);
    setStatus("idle");
    setError(null);
    setIsCorrecting(false);
    setActiveStepId(null);
    setLastAlternative(null);
    void stop().catch(() => undefined);

    if (!activeOwnerId || !activeSessionKey) {
      return () => {
        cancelled = true;
      };
    }

    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerId);
    } catch {
      return () => {
        cancelled = true;
      };
    }

    void TeacherAudioSessionStorage.load()
      .then((loaded) => {
        if (cancelled) return;
        bound.assertStillCurrent();
        if (!loaded) return;
        sessionRef.current = loaded;
        setSession(loaded);
        setStatus("paused");
        setActiveStepId(loaded.steps[loaded.currentStep]?.id ?? null);
      })
      .catch(() => {
        // Descarta leituras tardias após troca de conta ou revogação de sessão
      })
      .finally(() => bound.release());

    return () => {
      cancelled = true;
    };
  }, [activeOwnerId, activeSessionKey, stop]);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (
        event as CustomEvent<{ ownerId?: string; session?: TeacherAudioSession | null } | TeacherAudioSession | null>
      ).detail;
      const currentOwner = activeOwnerRef.current;
      if (!currentOwner) return;
      if (detail && typeof detail === "object" && "ownerId" in detail) {
        if (detail.ownerId !== currentOwner) return;
        const nextSession = detail.session ?? null;
        sessionRef.current = nextSession;
        setSession(nextSession);
        return;
      }
      const legacySession = detail as TeacherAudioSession | null;
      sessionRef.current = legacySession;
      setSession(legacySession);
    };
    window.addEventListener(TEACHER_AUDIO_SESSION_EVENT, handle);
    return () => window.removeEventListener(TEACHER_AUDIO_SESSION_EVENT, handle);
  }, []);

  const persist = useCallback(
    async (next: TeacherAudioSession, bound?: CapturedOperation) => {
      const owned = bound ?? startBoundSessionOperation(activeOwnerRef.current ?? undefined);
      try {
        owned.assertStillCurrent();
        const saved = await TeacherAudioSessionStorage.save(next, owned.context);
        owned.assertStillCurrent();
        sessionRef.current = saved;
        setSession(saved);
        return saved;
      } finally {
        if (!bound) owned.release();
      }
    },
    [],
  );

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
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return null;
    }

    setStatus("planning");
    setError(null);
    try {
      const plan: NarratedLessonPlan = await TeacherAudioLessonClient.plan({
        topic: input.topic,
        context: input.context,
        teaching: input.teaching,
      });
      bound.assertStillCurrent();
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
      await persist(next, bound);
      bound.assertStillCurrent();
      setActiveStepId(steps[0]?.id ?? null);
      setStatus("ready");
      return next;
    } catch (cause) {
      if (cause instanceof SessionChangedError) return null;
      try {
        bound.assertStillCurrent();
      } catch {
        return null;
      }
      const message = cause instanceof Error ? cause.message : "Não foi possível preparar a aula narrada.";
      setError(message);
      setStatus("error");
      return null;
    } finally {
      bound.release();
    }
  }, [persist]);

  /** Narra a etapa atual (ou o texto fornecido). */
  const narrate = useCallback(async (text?: string) => {
    const current = sessionRef.current;
    if (!current) return;
    const target = text ?? current.steps[current.currentStep]?.spoken;
    if (!target?.trim()) return;

    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }

    try {
      if (!current.narrationEnabled) {
        setStatus("ready");
        return;
      }

      setStatus("speaking");
      const nowIso = new Date().toISOString();
      await persist({ ...current, lastTickAt: nowIso, activeSeconds: accumulateActiveSeconds(current, nowIso) }, bound);

      try {
        await speak(target, { rate: current.rate, voice: current.voice });
      } catch {
        // Falha de TTS não impede leitura na tela
      }
      bound.assertStillCurrent();
      setStatus("ready");
    } catch (cause) {
      if (cause instanceof SessionChangedError) return;
      try {
        bound.assertStillCurrent();
        setStatus("ready");
      } catch {
        // Sessão trocada
      }
    } finally {
      bound.release();
    }
  }, [persist, speak]);

  const pauseNarration = useCallback(async () => {
    await pause();
    const current = sessionRef.current;
    if (!current) {
      setStatus("paused");
      return;
    }
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      await persist({ ...current, activeSeconds: accumulateActiveSeconds(current, nowIso), lastTickAt: null }, bound);
      bound.assertStillCurrent();
      setStatus("paused");
    } catch {
      // Descarta se sessão mudou
    } finally {
      bound.release();
    }
  }, [pause, persist]);

  const resumeNarration = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      await persist({ ...current, lastTickAt: nowIso }, bound);
      bound.assertStillCurrent();
      setStatus("ready");
    } catch {
      bound.release();
      return;
    }
    bound.release();
    await narrate();
  }, [narrate, persist]);

  const stopNarration = useCallback(async () => {
    await stop();
    const current = sessionRef.current;
    if (!current) {
      setStatus("ready");
      return;
    }
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }
    try {
      const nowIso = new Date().toISOString();
      await persist({ ...current, activeSeconds: accumulateActiveSeconds(current, nowIso), lastTickAt: null }, bound);
      bound.assertStillCurrent();
      setStatus("ready");
    } catch {
      // Descarta se sessão mudou
    } finally {
      bound.release();
    }
  }, [stop, persist]);

  /** Avança para a próxima etapa, marcando a atual como concluída. */
  const nextStep = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }

    let shouldAutoplayText: string | undefined;
    try {
      const steps = current.steps.map((step, index) =>
        index === current.currentStep ? { ...step, completed: true } : step,
      );
      if (current.currentStep >= steps.length - 1) {
        await persist({ ...current, steps, lastTickAt: null }, bound);
        bound.assertStillCurrent();
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
      await persist({ ...current, steps, currentStep: nextIndex, lastTickAt: null }, bound);
      bound.assertStillCurrent();
      setActiveStepId(steps[nextIndex]?.id ?? null);
      setStatus("ready");
      if (current.autoplay) shouldAutoplayText = steps[nextIndex]?.spoken;
    } catch {
      return;
    } finally {
      bound.release();
    }
    if (shouldAutoplayText) await narrate(shouldAutoplayText);
  }, [narrate, persist]);

  const previousStep = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.currentStep === 0) return;
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }
    try {
      const previousIndex = current.currentStep - 1;
      await persist({ ...current, currentStep: previousIndex, lastTickAt: null }, bound);
      bound.assertStillCurrent();
      setActiveStepId(current.steps[previousIndex]?.id ?? null);
      setStatus("ready");
    } catch {
      // Descarta se sessão mudou
    } finally {
      bound.release();
    }
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

    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return null;
    }

    setIsCorrecting(true);
    setStatus("correcting");
    let spokenFollowup: string | undefined;
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
      bound.assertStillCurrent();

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
      await persist(
        {
          ...current,
          steps,
          lastTickAt: nowIso,
          activeSeconds: accumulateActiveSeconds(current, nowIso),
        },
        bound,
      );
      bound.assertStillCurrent();
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

      if (current.narrationEnabled) spokenFollowup = steps[current.currentStep]?.spoken;
      bound.release();
      if (spokenFollowup) await narrate(spokenFollowup);
      return correction;
    } catch (cause) {
      bound.release();
      if (cause instanceof SessionChangedError) return null;
      try {
        bound.assertStillCurrent();
      } catch {
        return null;
      }
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

    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return null;
    }

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
      bound.assertStillCurrent();
      setLastAlternative(alternative);
      setStatus("ready");
      bound.release();
      if (current.narrationEnabled) await narrate(alternative);
      return alternative;
    } catch (cause) {
      bound.release();
      if (cause instanceof SessionChangedError) return null;
      try {
        bound.assertStillCurrent();
      } catch {
        return null;
      }
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar outra explicação.");
      return null;
    }
  }, [narrate]);

  /** Encerra a aula, preservando o histórico no Learning Engine. */
  const end = useCallback(async () => {
    const current = sessionRef.current;
    let bound: CapturedOperation | null = null;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      bound = null;
    }
    try {
      await stopNarration();
      if (bound) {
        bound.assertStillCurrent();
        if (current) {
          await LearningService.enqueueActivity({
            type: "reading",
            studyId: current.studyId,
            chapter: current.topic,
            durationMinutes: Math.max(1, Math.round(current.activeSeconds / 60)),
            occurredAt: new Date().toISOString(),
          });
        }
        await TeacherAudioSessionStorage.remove(bound.context);
        bound.assertStillCurrent();
      }
      sessionRef.current = null;
      setSession(null);
      setStatus("idle");
      setActiveStepId(null);
    } catch {
      // Descarta se sessão mudou durante o encerramento
    } finally {
      bound?.release();
    }
  }, [stopNarration]);

  /** Ativa ou desativa a narração sem perder a etapa. */
  const setNarrationEnabled = useCallback(async (enabled: boolean) => {
    const current = sessionRef.current;
    if (!current) return;
    let bound: CapturedOperation;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return;
    }
    try {
      if (!enabled) await stop();
      await persist({ ...current, narrationEnabled: enabled }, bound);
    } catch {
      // Descarta se sessão mudou
    } finally {
      bound.release();
    }
  }, [persist, stop]);

  /** Prepara um texto arbitrário (ex.: seleção de PDF) para narração. */
  const narrateSelection = useCallback(async (text: string) => {
    const narration = prepareNarration(text);
    if (!narration.spokenText) return null;
    const current = sessionRef.current;
    if (current?.narrationEnabled === false) return narration.spokenText;
    let bound: CapturedOperation | null = null;
    try {
      bound = startBoundSessionOperation(activeOwnerRef.current ?? undefined);
    } catch {
      return null;
    }
    setStatus("speaking");
    try {
      await speak(narration.spokenText, { rate: current?.rate, voice: current?.voice });
    } catch {
      // Falha de TTS não impede a leitura do texto na tela.
    }
    try {
      bound.assertStillCurrent();
      setStatus("ready");
    } catch {
      // Descarta após troca de conta
    } finally {
      bound.release();
    }
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
