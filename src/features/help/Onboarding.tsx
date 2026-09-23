"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, Cloud, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ExperiencePreferencesService, useExperiencePreferences, type ExperienceMode } from "@/features/preferences/ExperiencePreferences";

const steps = [
  { title: "Bem-vindo ao StudyAI", description: "Seu material, estudo e acompanhamento em um único espaço.", icon: BookOpen },
  { title: "Escolha a experiência", description: "Você pode mudar esta opção a qualquer momento em Configurações.", icon: Sparkles },
  { title: "Tudo fica no seu ritmo", description: "O StudyAI funciona offline e sincroniza novamente quando a conexão voltar.", icon: Cloud },
  { title: "Comece com um material", description: "Importe um PDF, DOCX, PPTX, áudio, vídeo ou texto para criar seu primeiro estudo.", icon: Upload },
] as const;

export function Onboarding() {
  const router = useRouter();
  const preferences = useExperiencePreferences();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const completedThisSession = useRef(false);

  useEffect(() => {
    const force = new URLSearchParams(window.location.search).has("onboarding");
    if (completedThisSession.current || (navigator.webdriver && !force) || (preferences.onboardingCompleted && !force)) { setOpen(false); return; }
    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [preferences.onboardingCompleted]);

  const current = steps[step];
  const Icon = current.icon;
  function complete(openImport = false) {
    completedThisSession.current = true;
    ExperiencePreferencesService.update({ onboardingCompleted: true });
    setOpen(false);
    if (openImport) router.push("/importar");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) complete(false); }}>
      <DialogContent className="max-w-xl overflow-hidden p-0" showCloseButton={false}>
        <div className="bg-gradient-to-br from-primary/15 via-background to-background px-6 pb-8 pt-9 text-center sm:px-10">
          <span className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><Icon className="size-6" /></span>
          <DialogTitle className="text-2xl tracking-tight">{current.title}</DialogTitle>
          <DialogDescription className="mx-auto mt-2 max-w-md text-sm leading-6">{current.description}</DialogDescription>
        </div>
        <div className="px-6 pb-6 sm:px-10">
          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["simple", "advanced"] as ExperienceMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => ExperiencePreferencesService.update({ mode })} className={`rounded-xl border p-4 text-left transition-colors ${preferences.mode === mode ? "border-primary bg-primary/5" : "hover:bg-accent/50"}`}>
                  <span className="flex items-center justify-between text-sm font-semibold">{mode === "simple" ? "Modo Simples" : "Modo Avançado"}{preferences.mode === mode && <Check className="size-4 text-primary" />}</span>
                  <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">{mode === "simple" ? "Somente o essencial para estudar sem distrações." : "Diagnósticos, grafo, pipeline e controles técnicos."}</span>
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 flex items-center gap-1.5" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
            {steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft />Voltar</Button>
            {step < steps.length - 1 ? <Button onClick={() => setStep((value) => value + 1)}>Continuar<ArrowRight /></Button> : <Button onClick={() => complete(true)}>Importar primeiro material<Upload /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
