"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useVoice } from "@/features/voice/hooks/useVoice";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

// Import icons from lucide-react
import { Play, Pause, Stop } from "lucide-react";

type RateOption = 0.75 | 1 | 1.25 | 1.5 | 2;

interface AudioPlayerProps {
  text: string;
  onSpeak?: (text: string, options?: { rate?: RateOption; voice?: string }) => void;
  onStop?: () => void;
  disabled?: boolean;
}

export function AudioPlayer({ text, onSpeak, onStop, disabled }: AudioPlayerProps) {
  const { speak, pause, resume, stop, status, preferences, setPreferences } =
    useVoice();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedRate, setSelectedRate] = useState<RateOption>(1);
  const [selectedVoice, setSelectedVoice] = useState<string>("");

  // Efeitos para sincronizar preferências UI com o hook
  useEffect(() => {
    setSelectedRate(preferences.rate ?? 1);
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

  const handlePause = useCallback(() => {
    pause();
  }, [pause]);

  const handleResume = useCallback(() => {
    resume();
  }, [resume]);

  const handleStop = useCallback(() => {
    stop();
    onStop?.();
  }, [stop, onStop]);

  // Renderizar controles
  return (
    <Card className="shadow-none">
      <CardHeader className="px-0 py-2 border-b">
        <CardTitle className="text-sm font-medium">
          <Mic className="size-4 me-2 align-middle" aria-hidden="true" />
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
              <Stop className="size-4" aria-hidden="true" />
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
              <Stop className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>

        {/* Controles de velocidade */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Velocidade:
          </span>
          <Select
            value={selectedRate}
            onValueChange={setSelectedRate}
            disabled={disabled}
            className="h-8 w-24"
          >
            <SelectTrigger>
              <SelectValue placeholder="0.75x" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={0.75}>0.75x</SelectItem>
              <SelectItem value={1}>1x</SelectItem>
              <SelectItem value={1.25}>1.25x</SelectItem>
              <SelectItem value={1.5}>1.5x</SelectItem>
              <SelectItem value={2}>2x</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Seleção de voz */}
        {status.available && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Voz:
            </span>
            <Select
              value={selectedVoice || "Padrão"}
              onValueChange={setSelectedVoice}
              disabled={disabled}
              className="h-8 w-[180px]"
            >
              <SelectTrigger>
                <SelectValue placeholder={selectedVoice || "Selecione uma voz"} />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.name} value={voice.name}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Stop className="size-4" aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}