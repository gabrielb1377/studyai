"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TutorMessage } from "./TutorMessage";
import type { TutorMessage as TutorMessageType } from "@/types/tutor";
import { useVoice } from "@/features/voice/hooks/useVoice";
import { prepareNarrationText } from "@/features/teacher/services/TeacherNarrationService";

export function TutorConversation({
  messages,
  isLoading,
  assistantLabel = "Tutor",
  conversationId,
  studyId,
  userScope,
  onResponseAction,
}: {
  messages: readonly TutorMessageType[];
  isLoading: boolean;
  assistantLabel?: "Tutor" | "Professor";
  conversationId?: string;
  studyId?: string;
  userScope?: string;
  onResponseAction?: (action: "continue" | "regenerate" | "explain", response: string) => void;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastContent = messages.at(-1)?.content;
  const { status, speak, pause, resume, stop } = useVoice();
  const [activeSpeechMessageId, setActiveSpeechMessageId] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | undefined>(undefined);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [isLoading, lastContent, messages.length]);

  useEffect(() => {
    setActiveSpeechMessageId(null);
    setSpeechError(undefined);
    void stop();
  }, [conversationId, studyId, userScope, stop]);

  useEffect(() => {
    if (!status.isSpeaking && !status.isPaused) {
      setActiveSpeechMessageId(null);
    }
  }, [status.isSpeaking, status.isPaused]);

  const startMessageSpeech = useCallback(
    async (message: TutorMessageType) => {
      const spoken = prepareNarrationText(message.content);
      if (!spoken) return;

      if (!status.available) {
        setActiveSpeechMessageId(message.id);
        setSpeechError("Síntese de voz indisponível neste navegador.");
        return;
      }

      setSpeechError(undefined);
      setActiveSpeechMessageId(message.id);
      await speak(spoken);
    },
    [speak, status.available],
  );

  const handlePauseResume = useCallback(async () => {
    if (status.isPaused) {
      await resume();
    } else {
      await pause();
    }
  }, [pause, resume, status.isPaused]);

  const handleStop = useCallback(async () => {
    setActiveSpeechMessageId(null);
    setSpeechError(undefined);
    await stop();
  }, [stop]);

  return (
    <section aria-label="Conversa com o Tutor IA" className="premium-scroll min-h-0 flex-1 space-y-6 overflow-y-auto rounded-2xl border bg-background/55 p-4 sm:p-6">
      {messages.length === 0 && !isLoading && (
        <div className="flex min-h-[360px] items-center justify-center text-center sm:min-h-[460px]">
          <div>
            <p className="font-medium">Conversa vazia</p>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">Envie uma pergunta. Quando houver um estudo aberto, o {assistantLabel} usará apenas o contexto real recuperado.</p>
          </div>
        </div>
      )}
      {messages.map((message) => {
        const isCurrent = activeSpeechMessageId === message.id;
        return (
          <div key={message.id} className="min-w-0">
            <TutorMessage
              message={message}
              onResponseAction={onResponseAction}
              speech={{
                isActive: isCurrent && (status.isSpeaking || status.isPaused || Boolean(speechError)),
                isSpeaking: isCurrent && status.isSpeaking,
                isPaused: isCurrent && status.isPaused,
                available: status.available,
                error: isCurrent ? speechError ?? status.error?.message : undefined,
                onStart: () => { void startMessageSpeech(message); },
                onPauseResume: () => { void handlePauseResume(); },
                onStop: () => { void handleStop(); },
              }}
            />
            {message.sources && (message.sources.length > 0
              ? <details className="mt-2 break-words text-sm">
                <summary className="cursor-pointer">Fontes recuperadas ({message.sources.length})</summary>
                <ul className="space-y-2 pt-2">{message.sources.map((source) => <li key={source.id}>
                  <strong>{source.name}{source.page ? ` · p. ${source.page}` : ""}</strong>
                  <blockquote>{source.excerpt}</blockquote>
                </li>)}</ul>
              </details>
              : <p className="mt-2 text-sm text-muted-foreground">Nenhum trecho relevante encontrado nos materiais selecionados.</p>)}
          </div>
        );
      })}
      {isLoading && (
        <div className="flex items-center gap-2 rounded-xl bg-secondary/50 px-4 py-3 text-sm text-muted-foreground" role="status" aria-live="polite">
          <span className="size-2 animate-pulse rounded-full bg-primary" />
          <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:150ms]" />
          <span className="size-2 animate-pulse rounded-full bg-primary [animation-delay:300ms]" />
          O {assistantLabel} está preparando a resposta...
        </div>
      )}
      <div ref={endRef} aria-hidden="true" />
    </section>
  );
}
