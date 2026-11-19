"use client";

import { useState, useCallback, useEffect } from "react";
import { useVoice } from "@/features/voice/hooks/useVoice";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

// Import icons from lucide-react
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Mic } from "lucide-react";

type RateOption = 0.75 | 1 | 1.25 | 1.5 | 2;

interface TeacherAudioPlayerProps {
  text: string;
  stepIndex: number;
  totalSteps: number;
  onPlayPause: () => void;
  onStop: () => void;
  onNextStep: () => void;
  onPrevStep: () => void;
  onRepeat: () => void;
  onRateChange: (rate: RateOption) => void;
  onVoiceChange: (voice: string) => void;
  onToggleAutoplay: (enabled: boolean) => void;
  isPlaying: boolean;
  isPaused: boolean;
  currentRate: RateOption;
  currentVoice: string;
  autoplay: boolean;
  disabled?: boolean;
}

export function TeacherAudioPlayer({
  text,
  stepIndex,
  totalSteps,
  onPlayPause,
  onStop,
  onNextStep,
  onPrevStep,
  onRepeat,
  onRateChange,
  onVoiceChange,
  onToggleAutoplay,
  isPlaying,
  isPaused,
  currentRate,
  currentVoice,
  autoplay,
  disabled,
}: TeacherAudioPlayerProps) {
  const { stop, status, getAvailableVoices } = useVoice();

  const [selectedRate, setSelectedRate] = useState<RateOption>(currentRate);
  const [selectedVoice, setSelectedVoice] = useState<string>(currentVoice);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  // Load voices when available
  useEffect(() => {
    const availableVoices = getAvailableVoices();
    setVoices(availableVoices);
  }, [getAvailableVoices, status.available]);

  // Efeitos para sincronizar preferências UI com o hook
  useEffect(() => {
    setSelectedRate(currentRate);
    setSelectedVoice(currentVoice);
  }, [currentRate, currentVoice]);

  // Funções de controle
  const handlePlayPause = useCallback(() => {
    if (!text?.trim()) return;
    onPlayPause();
  }, [text, onPlayPause]);

  const handleStop = useCallback(() => {
    stop();
    onStop();
  }, [stop, onStop]);

  const handleRateChange = useCallback(
    (rate: string) => {
      const rateValue = parseFloat(rate) as RateOption;
      setSelectedRate(rateValue);
      onRateChange(rateValue);
    },
    [onRateChange]
  );

  const handleVoiceChange = useCallback(
    (voice: string) => {
      setSelectedVoice(voice);
      onVoiceChange(voice);
    },
    [onVoiceChange]
  );

  const handleToggleAutoplay = useCallback(() => {
    onToggleAutoplay(!autoplay);
  }, [autoplay, onToggleAutoplay]);

  // Renderizar controles
  return (
    <Card className="shadow-none">
      <CardHeader className="px-0 py-2 border-b">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-primary" aria-hidden="true" />
            <span>Aula Narrada</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <span>Etapa {stepIndex + 1} de {totalSteps}</span>
            <Progress value={((stepIndex + 1) / totalSteps) * 100} className="w-24 h-1.5" />
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {/* Área de texto (readonly para o player) */}
        <div className="h-32 overflow-y-auto rounded-md border bg-muted/50 p-2 text-sm">
          {text}
        </div>

        {/* Controles principais de navegação da aula */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Botão etapa anterior */}
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={disabled || stepIndex === 0}
            onClick={onPrevStep}
            aria-label="Etapa anterior"
            className="flex-1 sm:flex-none"
          >
            <SkipBack className="size-4" aria-hidden="true" />
          </Button>

          {/* Botão repetir explicação */}
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={disabled}
            onClick={onRepeat}
            aria-label="Repetir explicação"
            className="flex-1 sm:flex-none"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>

          {/* Botão principal: play/pause/stop */}
          <Button
            type="button"
            size="icon"
            variant={isPlaying ? "destructive" : "secondary"}
            disabled={disabled}
            onClick={handlePlayPause}
            aria-label={isPlaying ? "Pausar narração" : isPaused ? "Continuar narração" : "Ouvir etapa"}
            className="flex-1"
          >
            {isPlaying ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4" aria-hidden="true" />
            )}
          </Button>

          {/* Botão próxima etapa */}
          <Button
            type="button"
            size="icon"
            variant="outline"
            disabled={disabled || stepIndex >= totalSteps - 1}
            onClick={onNextStep}
            aria-label="Próxima etapa"
            className="flex-1 sm:flex-none"
          >
            <SkipForward className="size-4" aria-hidden="true" />
          </Button>

          {/* Botão parar */}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            disabled={disabled || (!isPlaying && !isPaused)}
            onClick={handleStop}
            aria-label="Parar aula"
            className="flex-1 sm:flex-none"
          >
            <span className="size-4" aria-hidden="true">⏹</span>
          </Button>
        </div>

        {/* Controles de velocidade */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Velocidade:
          </span>
          <select
            value={selectedRate.toString()}
            onChange={(e) => handleRateChange(e.target.value)}
            disabled={disabled}
            className="h-8 w-24 rounded-md border bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="0.75">0.75x</option>
            <option value="1">1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
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
              onChange={(e) => handleVoiceChange(e.target.value)}
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

        {/* Autoplay toggle */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={autoplay ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled}
            onClick={handleToggleAutoplay}
            aria-label={autoplay ? "Desativar reprodução automática" : "Ativar reprodução automática"}
            className="flex items-center gap-1.5"
          >
            <Mic className="size-3.5" aria-hidden="true" />
            <span className="text-xs">Auto</span>
          </Button>
          <span className="text-xs text-muted-foreground">
            {autoplay ? "Avança automaticamente" : "Aguardar confirmação"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}