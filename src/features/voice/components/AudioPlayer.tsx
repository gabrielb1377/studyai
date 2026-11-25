"use client";

import { useState, useCallback, useEffect } from "react";
import { useVoice } from "@/features/voice/hooks/useVoice";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Import icons from lucide-react
import { Play, Pause } from "lucide-react";

type RateOption = 0.75 | 1 | 1.25 | 1.5 | 2;

interface AudioPlayerProps {
  text: string;
  onSpeak?: (text: string, options?: { rate?: RateOption; voice?: string }) => void;
  onStop?: () => void;
  disabled?: boolean;
}

export function AudioPlayer({ text, onSpeak, onStop, disabled }: AudioPlayerProps) {
  const { stop, pause, resume, status, preferences, getAvailableVoices } = useVoice();

  const [selectedRate, setSelectedRate] = useState<RateOption>(1);
  const [selectedVoice, setSelectedVoice] = useState<string>("");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load voices when available
  useEffect(() => {
    const availableVoices = getAvailableVoices();
    setVoices(availableVoices);
  }, [getAvailableVoices, status.available]);

  // Efeitos para sincronizar preferências UI com o hook
  useEffect(() => {
    setSelectedRate((preferences.rate ?? 1) as RateOption);
    setSelectedVoice(preferences.voice ?? "");
  }, [preferences]);

  // Funções de controle
  const handleSpeak = useCallback(() => {
    if (!text?.trim()) return;
    onSpeak?.(text, {
      rate: selectedRate,
      voice: selectedVoice || undefined,
    });
  }, [text, selectedRate, selectedVoice, onSpeak]);

  const handleStop = useCallback(() => {
    stop();
    onStop?.();
  }, [stop, onStop]);

  const handlePause = useCallback(async () => {
    await pause();
  }, [pause]);

  const handleResume = useCallback(async () => {
    await resume();
  }, [resume]);

  // Renderizar controles
  return (
    <Card className="shadow-none">
      <CardHeader className="px-0 py-2 border-b">
        <CardTitle className="text-sm font-medium">
          <span className="size-4 me-2 align-middle" aria-hidden="true">🔊</span>
          Áudio
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Área de texto (readonly para o player) */}
        <div className="h-24 overflow-y-auto rounded-md border bg-muted/50 p-2 text-sm">
          {text}
        </div>

        {/* Controles principais */}
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Botão principal: falar/parar */}
          <Button
            type="button"
            size="icon"
            variant={status.isSpeaking ? "destructive" : "secondary"}
            disabled={disabled}
            onClick={handleSpeak}
            aria-label={status.isSpeaking ? "Parar narração" : "Ouvir conteúdo"}
            className="flex-1"
          >
            {status.isSpeaking ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </Button>

          {/* Botão pausar/continuar (apenas quando speaking) */}
          {status.isSpeaking && !status.isPaused && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={disabled}
              onClick={handlePause}
              aria-label="Pausar narração"
              className="flex-1"
            >
              <Pause className="size-4" aria-hidden="true" />
            </Button>
          )}

          {status.isPaused && (
            <Button
              type="button"
              size="icon"
              variant="outline"
              disabled={disabled}
              onClick={handleResume}
              aria-label="Continuar narração"
              className="flex-1"
            >
              <Play className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Controles de velocidade */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Velocidade:
          </span>
          <select
            value={selectedRate}
            onChange={(e) => setSelectedRate(parseFloat(e.target.value) as RateOption)}
            disabled={disabled}
            className="h-8 w-24 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>

        {/* Seleção de voz */}
        {status.available && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Voz:
            </span>
            <select
              value={selectedVoice || "Padrão"}
              onChange={(e) => setSelectedVoice(e.target.value)}
              disabled={disabled}
              className="h-8 w-[180px] rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Selecione uma voz</option>
              {voices.map((voice) => (
                <option key={voice.name} value={voice.name}>
                  {voice.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Botão de parar sempre visível quando há texto */}
        {text?.trim() && (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled}
            onClick={handleStop}
            aria-label="Parar narração"
            className="mt-2"
          >
            <span className="size-4" aria-hidden="true">⏹</span>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}