"use client";

import { useState, useCallback, useEffect } from "react";
import { Mic, MicOff, Send, X, AlertTriangle, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSpeechRecognition } from "@/features/voice/hooks/useSpeechRecognition";
import { useVoice } from "@/features/voice/hooks/useVoice";

interface VoiceInputProps {
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  context?: string;
}

export function VoiceInput({
  onSendMessage,
  disabled,
  placeholder = "Clique no microfone e fale sua pergunta...",
  context,
}: VoiceInputProps) {
  const {
    status,
    transcript,
    interimTranscript,
    isListening,
    error,
    language,
    setLanguage,
    startListening,
    stopListening,
    abortListening,
    clearTranscript,
  } = useSpeechRecognition();

  const { stop, status: ttsStatus } = useVoice();
  void context;

  const [isExpanded, setIsExpanded] = useState(false);
  const [editableTranscript, setEditableTranscript] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const displayTranscript = interimTranscript || transcript;

  // Sync editable transcript when final transcript changes
  useEffect(() => {
    if (transcript && !isEditing) {
      setEditableTranscript(transcript);
    }
  }, [transcript, isEditing]);

  const handleStartListening = useCallback(async () => {
    await startListening({ continuous: false, interimResults: true });
  }, [startListening]);

  const handleStopListening = useCallback(async () => {
    await stopListening();
  }, [stopListening]);

  const handleAbort = useCallback(async () => {
    await abortListening();
    setEditableTranscript("");
  }, [abortListening]);

  const handleConfirmTranscript = useCallback(() => {
    const text = editableTranscript.trim();
    if (text) {
      onSendMessage(text);
      clearTranscript();
      setEditableTranscript("");
      setIsEditing(false);
    }
  }, [editableTranscript, onSendMessage, clearTranscript]);

  const handleCancelEditing = useCallback(() => {
    setEditableTranscript(transcript);
    setIsEditing(false);
  }, [transcript]);

  const handleRetry = useCallback(() => {
    setEditableTranscript("");
    // Will trigger a new listening session
  }, []);

  return (
    <Card className="shadow-none border-primary/20 bg-primary/5">
      <CardHeader className="px-0 py-2 border-b">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Mic className="size-4 text-primary" aria-hidden="true" />
            <span>Entrada por Voz</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={disabled || isListening}
              className="h-8 w-[140px] text-xs rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
              <option value="es-ES">Español</option>
            </select>
            {!isListening && (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-label={isExpanded ? "Recolher" : "Expandir"}
              >
                <Volume2 className="size-4" aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Status indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`flex size-2 rounded-full ${isListening ? "bg-green-500 animate-pulse" : "bg-muted-foreground/50"}`} />
          <span>
            {isListening
              ? "Ouvindo..."
              : status === "transcribing"
              ? "Transcrevendo..."
              : status === "error"
              ? "Erro"
              : "Pronto"}
          </span>
          {error && (
            <AlertTriangle className="size-3 text-destructive" aria-hidden="true" />
          )}
        </div>

        {/* Transcription area */}
        <div className="space-y-2">
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                value={editableTranscript}
                onChange={(e) => setEditableTranscript(e.target.value)}
                placeholder={placeholder}
                rows={3}
                className="w-full rounded-md border border-primary/30 bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disabled}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirmTranscript}
                  disabled={disabled || !editableTranscript.trim()}
                >
                  <Send className="size-3.5 me-1" aria-hidden="true" />
                  Enviar
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCancelEditing}
                >
                  <X className="size-3.5 me-1" aria-hidden="true" />
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div
                className={`min-h-[80px] max-h-48 rounded-md border p-3 text-sm ${
                  isListening ? "border-primary/50 bg-primary/5" : "bg-muted/30"
                }`}
                role="textbox"
                aria-live={isListening ? "polite" : "off"}
              >
                {displayTranscript ? (
                  <span className="text-foreground">{displayTranscript}</span>
                ) : (
                  <span className="text-muted-foreground">{placeholder}</span>
                )}
                {interimTranscript && (
                  <span className="text-muted-foreground/70 italic">{interimTranscript}</span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {transcript && !isEditing && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditing(true)}
                    disabled={disabled}
                  >
                    Editar
                  </Button>
                )}

                {isListening ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={handleStopListening}
                    disabled={disabled}
                    className="flex-1"
                  >
                    <MicOff className="size-3.5 me-1" aria-hidden="true" />
                    Parar
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant={transcript ? "secondary" : "default"}
                      onClick={handleStartListening}
                      disabled={disabled || isListening}
                      className="flex-1"
                    >
                      <Mic className="size-3.5 me-1" aria-hidden="true" />
                      {transcript ? "Gravar novamente" : "Iniciar"}
                    </Button>
                    {transcript && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={handleAbort}
                        disabled={disabled}
                      >
                        <X className="size-3.5 me-1" aria-hidden="true" />
                        Cancelar
                      </Button>
                    )}
                  </>
                )}

                {error && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRetry}
                    disabled={disabled}
                    className="text-destructive border-destructive"
                  >
                    <AlertTriangle className="size-3.5 me-1" aria-hidden="true" />
                    Tentar novamente
                  </Button>
                )}
              </div>

              {/* Send button when transcript is ready */}
              {transcript && !isListening && !isEditing && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleConfirmTranscript}
                  disabled={disabled}
                  className="w-full"
                >
                  <Send className="size-3.5 me-1" aria-hidden="true" />
                  Enviar pergunta
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              <span>{error.message}</span>
            </div>
          </div>
        )}

        {/* TTS indicator when response is being narrated */}
        {ttsStatus.isSpeaking && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm text-primary">
            <div className="flex items-center gap-2">
              <Volume2 className="size-4 shrink-0 animate-pulse" aria-hidden="true" />
              <span>Professor narrando a resposta...</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => stop()}
                aria-label="Parar narração"
              >
                <VolumeX className="size-3.5" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}