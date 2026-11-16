"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, FileText, LoaderCircle, Mic, MicOff, Paperclip, Send, WifiOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSpeechRecognition } from "@/features/voice/hooks/useSpeechRecognition";
import {
  disableVoiceInput,
  enableVoiceInput,
  getVoiceConsentState,
  grantVoiceConsent,
  type VoiceConsentState,
} from "@/features/voice/voice-consent";
import { ExperiencePreferencesService } from "@/features/preferences/ExperiencePreferences";
import { useConnectivity } from "@/features/platform/useConnectivity";

const tutorQuickActions = ["Explicar", "Resumir", "Flashcards", "Exercícios"];
const teacherQuickActions = ["Explique este conceito", "Dê um exemplo prático", "Faça uma pergunta", "Revise comigo"];

export function TutorComposer({
  mode = "tutor",
  draft,
  isLoading,
  isSummaryLoading,
  conversationId,
  studyId,
  userScope,
  onDraftChange,
  onGenerateSummary,
  onSend,
}: {
  mode?: "tutor" | "teacher";
  draft: string;
  isLoading: boolean;
  isSummaryLoading: boolean;
  conversationId?: string;
  studyId?: string;
  userScope?: string;
  onDraftChange: (value: string) => void;
  onGenerateSummary: () => void;
  onSend: () => void;
}) {
  const { isOnline } = useConnectivity();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const baseDraftRef = useRef("");
  const wasListeningRef = useRef(false);

  const {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error: voiceError,
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
  } = useSpeechRecognition();

  const [consent, setConsent] = useState<VoiceConsentState>(() => getVoiceConsentState(userScope));
  const [showConsentPrompt, setShowConsentPrompt] = useState(false);
  const [localVoiceNotice, setLocalVoiceNotice] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setReducedMotion(ExperiencePreferencesService.get().reducedMotion || prefersReducedMotion);
  }, []);

  useEffect(() => {
    setConsent(getVoiceConsentState(userScope));
    setShowConsentPrompt(false);
    setLocalVoiceNotice(null);
    void abortListening();
  }, [userScope, conversationId, studyId, abortListening]);

  const updateDraft = (value: string) => {
    onDraftChange(value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
    }
  };

  useEffect(() => {
    if (isListening) {
      wasListeningRef.current = true;
      const spokenPart = [transcript, interimTranscript].filter(Boolean).join(" ").trim();
      const prefix = baseDraftRef.current.trimEnd();
      const combined = spokenPart ? (prefix ? `${prefix} ${spokenPart}` : spokenPart) : baseDraftRef.current;
      onDraftChange(combined);
      return;
    }

    if (wasListeningRef.current) {
      wasListeningRef.current = false;
      if (transcript) {
        const prefix = baseDraftRef.current.trimEnd();
        onDraftChange(prefix ? `${prefix} ${transcript}`.trim() : transcript);
        clearTranscript();
        textareaRef.current?.focus();
      }
    }
  }, [isListening, transcript, interimTranscript, onDraftChange, clearTranscript]);

  const handleMicClick = async () => {
    setLocalVoiceNotice(null);

    if (isListening) {
      await stopListening();
      return;
    }

    if (!isSupported) {
      setLocalVoiceNotice("Reconhecimento de fala não suportado neste navegador. Você pode continuar digitando normalmente.");
      return;
    }

    const latestConsent = getVoiceConsentState(userScope);
    setConsent(latestConsent);

    if (!latestConsent.accepted) {
      setShowConsentPrompt(true);
      return;
    }

    if (!latestConsent.enabled) {
      const enabled = enableVoiceInput(userScope);
      setConsent(enabled);
    }

    baseDraftRef.current = draft;
    await startListening({ continuous: false, interimResults: true });
  };

  const handleGrantConsent = async () => {
    const granted = grantVoiceConsent(userScope);
    setConsent(granted);
    setShowConsentPrompt(false);
    setLocalVoiceNotice(null);
    baseDraftRef.current = draft;
    await startListening({ continuous: false, interimResults: true });
  };

  const handleCancelListening = async () => {
    wasListeningRef.current = false;
    await abortListening();
    updateDraft(baseDraftRef.current);
  };

  const handleDisableVoice = async () => {
    if (isListening) {
      await abortListening();
    }
    setConsent(disableVoiceInput(userScope));
    setShowConsentPrompt(false);
    setLocalVoiceNotice("Entrada por voz desativada. Você pode reativá-la pelo microfone quando quiser.");
  };

  const activeAlert = localVoiceNotice ?? (voiceError && consent.accepted ? voiceError.message : null);

  return (
    <div className="mt-5">
      {!isOnline && (
        <div role="status" className="mb-3 flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-muted-foreground">
          <WifiOff className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <p className="flex-1">
            Sem conexão com a internet. A geração de respostas e resumos com IA está indisponível offline; suas conversas e materiais locais continuam acessíveis.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap gap-2" aria-label="Ações rápidas">
        {(mode === "teacher" ? teacherQuickActions : tutorQuickActions).map((action) => (
          <Button
            key={action}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => updateDraft(mode === "teacher" ? action : `${action} este tema`)}
          >
            {action}
          </Button>
        ))}
        <Button type="button" size="sm" variant="secondary" onClick={onGenerateSummary} disabled={isLoading || isSummaryLoading || !isOnline}>
          <FileText className="size-4" aria-hidden="true" />
          {isSummaryLoading ? "Gerando resumo..." : "Gerar resumo"}
        </Button>
      </div>

      {showConsentPrompt && (
        <section
          aria-label="Consentimento de entrada por voz"
          className="mb-3 rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs leading-5"
        >
          <p className="font-medium text-foreground">Ativar entrada por voz no navegador?</p>
          <p className="mt-1 text-muted-foreground">
            O ditado utiliza o reconhecimento de fala do próprio navegador. O áudio pode ser enviado aos servidores do navegador, não funciona offline e o StudyAI não armazena áudio bruto. A transcrição aparece no campo abaixo para você revisar antes de enviar.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => { void handleGrantConsent(); }}>
              Permitir e ativar microfone
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowConsentPrompt(false)}>
              Cancelar
            </Button>
          </div>
        </section>
      )}

      {activeAlert && (
        <div role="alert" className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">{activeAlert}</p>
          <button
            type="button"
            aria-label="Fechar aviso de voz"
            onClick={() => setLocalVoiceNotice(null)}
            className="rounded p-0.5 hover:bg-destructive/10"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {isListening && (
        <div role="status" aria-live="polite" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <span className="flex items-center gap-2 font-medium text-primary">
            <span className={`size-2 rounded-full bg-destructive ${reducedMotion ? "" : "animate-pulse"}`} aria-hidden="true" />
            Ouvindo... fale sua dúvida e revise o texto antes de enviar.
          </span>
          <div className="flex items-center gap-1.5">
            <Button type="button" size="sm" variant="outline" onClick={() => { void stopListening(); }}>
              Parar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { void handleCancelListening(); }}>
              Cancelar gravação
            </Button>
          </div>
        </div>
      )}

      <form
        className="rounded-2xl border bg-card/95 p-2 shadow-[var(--shadow-card)] transition-shadow focus-within:border-primary/35 focus-within:shadow-md"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isOnline) return;
          if (isListening) {
            void stopListening();
          }
          onSend();
        }}
      >
        <textarea
          ref={textareaRef}
          aria-label="Mensagem para o Tutor IA"
          value={draft}
          onChange={(event) => updateDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (draft.trim() && !isLoading && isOnline) {
                if (isListening) void stopListening();
                onSend();
              }
            }
          }}
          placeholder={mode === "teacher" ? "Responda à aula ou peça outra explicação..." : "Pergunte sobre o tema que está estudando..."}
          rows={1}
          className="max-h-45 min-h-11 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between gap-3 border-t px-1 pt-2">
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Anexar arquivo (em breve)">
              <Paperclip className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant={isListening ? "destructive" : "ghost"}
              size="icon-sm"
              aria-label={isListening ? "Parar gravação" : "Usar entrada por voz"}
              aria-pressed={isListening}
              disabled={isLoading}
              onClick={() => { void handleMicClick(); }}
            >
              {isListening ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            </Button>
            {consent.accepted && consent.enabled && !isListening && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-muted-foreground"
                onClick={() => { void handleDisableVoice(); }}
              >
                Desativar voz
              </Button>
            )}
          </div>
          <Button type="submit" size="sm" className="h-9" disabled={!draft.trim() || isLoading || !isOnline}>
            {isLoading ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {isLoading ? "Enviando..." : "Enviar"}
          </Button>
        </div>
      </form>
      <p className="mt-2 text-center text-xs text-muted-foreground">As respostas são geradas pelo provider selecionado e podem conter imprecisões.</p>
    </div>
  );
}
