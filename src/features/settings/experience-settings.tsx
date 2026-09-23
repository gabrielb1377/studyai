"use client";

import { Check, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExperiencePreferencesService, useExperiencePreferences, type ExperienceMode } from "@/features/preferences/ExperiencePreferences";

export function ExperienceSettings() {
  const preferences = useExperiencePreferences();
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="size-4 text-primary" />Experiência</CardTitle>
        <CardDescription>Escolha quanto controle e detalhe deseja ver no dia a dia.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["simple", "advanced"] as ExperienceMode[]).map((mode) => (
            <button key={mode} type="button" aria-pressed={preferences.mode === mode} onClick={() => ExperiencePreferencesService.update({ mode })} className={`rounded-xl border p-4 text-left transition-all ${preferences.mode === mode ? "border-primary bg-primary/5 shadow-sm" : "hover:bg-accent/50"}`}>
              <span className="flex items-center justify-between text-sm font-semibold">{mode === "simple" ? "Modo Simples" : "Modo Avançado"}{preferences.mode === mode && <Check className="size-4 text-primary" />}</span>
              <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{mode === "simple" ? "Prioriza Biblioteca, Estudo, Tutor e ações essenciais." : "Exibe pipeline, providers, grafo, métricas e controles técnicos."}</span>
            </button>
          ))}
        </div>
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
          <span><span className="flex items-center gap-2 font-medium"><SlidersHorizontal className="size-4" />Densidade compacta</span><span className="mt-1 block text-xs text-muted-foreground">Mostra mais conteúdo em telas de notebook e desktop.</span></span>
          <input type="checkbox" className="size-4 accent-primary" checked={preferences.compactDensity} onChange={(event) => ExperiencePreferencesService.update({ compactDensity: event.target.checked })} />
        </label>
        <label className="flex min-h-11 items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm">
          <span><span className="font-medium">Compartilhar métricas anônimas</span><span className="mt-1 block text-xs text-muted-foreground">Envia somente desempenho e erros técnicos, sem conteúdo, arquivos ou perguntas.</span></span>
          <input type="checkbox" className="size-4 accent-primary" checked={preferences.telemetryConsent} onChange={(event) => ExperiencePreferencesService.update({ telemetryConsent: event.target.checked })} />
        </label>
        <Button type="button" size="sm" variant="outline" onClick={() => ExperiencePreferencesService.resetGuides()}><RotateCcw />Rever tour e dicas</Button>
      </CardContent>
    </Card>
  );
}
