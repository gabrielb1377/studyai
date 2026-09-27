"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, ArrowRight, BookOpen, Check, Cloud, GraduationCap, Sparkles, Target, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ExperiencePreferencesService, useExperiencePreferences, type ExperienceMode } from "@/features/preferences/ExperiencePreferences";
import { AISettings, aiProviderOptions } from "@/features/ai/AISettings";
import { useAuth } from "@/features/account/AuthProvider";
import { AuthClient } from "@/features/account/AuthClient";

const steps = [
  { title: "Bem-vindo ao StudyAI", description: "Seu material, estudo e acompanhamento em um único espaço.", icon: BookOpen },
  { title: "Escolha a experiência", description: "Você pode mudar esta opção a qualquer momento em Configurações.", icon: Sparkles },
  { title: "Seu contexto acadêmico", description: "Essas informações ajudam a organizar os materiais desde a primeira importação.", icon: GraduationCap },
  { title: "Qual é o seu objetivo?", description: "O plano de estudos usa essa preferência para priorizar suas próximas ações.", icon: Target },
  { title: "Ajuste sua experiência", description: "Escolha idioma, aparência e o provider de IA preferido. Tudo pode ser alterado depois.", icon: Cloud },
  { title: "Comece com um material", description: "Importe um PDF, DOCX, PPTX, áudio, vídeo ou texto para criar seu primeiro estudo.", icon: Upload },
] as const;

export function Onboarding() {
  const router = useRouter();
  const auth = useAuth();
  const { setTheme, theme } = useTheme();
  const preferences = useExperiencePreferences();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const completedThisSession = useRef(false);
  const [profile, setProfile] = useState(preferences.onboardingProfile);

  useEffect(() => {
    const force = new URLSearchParams(window.location.search).has("onboarding");
    if (completedThisSession.current || (navigator.webdriver && !force) || (preferences.onboardingCompleted && !force)) { setOpen(false); return; }
    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [preferences.onboardingCompleted]);

  const current = steps[step];
  const Icon = current.icon;
  async function complete(openImport = false) {
    completedThisSession.current = true;
    ExperiencePreferencesService.update({ onboardingCompleted: true, onboardingProfile: profile });
    AISettings.save(profile.provider);
    if (auth.session) {
      await AuthClient.updateProfile({ language: profile.language, theme: theme ?? "system", preferences: { ...auth.session.user.profile?.preferences, onboarding: profile, experienceMode: preferences.mode } }).then(() => auth.refresh()).catch(() => undefined);
    }
    setOpen(false);
    if (openImport) router.push("/importar");
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) void complete(false); }}>
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
          {step === 2 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input aria-label="Curso" value={profile.course} onChange={(event) => setProfile((current) => ({ ...current, course: event.target.value }))} placeholder="Curso" />
              <Input aria-label="Faculdade" value={profile.institution} onChange={(event) => setProfile((current) => ({ ...current, institution: event.target.value }))} placeholder="Faculdade" />
              <Input aria-label="Semestre" value={profile.semester} onChange={(event) => setProfile((current) => ({ ...current, semester: event.target.value }))} placeholder="Semestre atual" className="sm:col-span-2" />
            </div>
          )}
          {step === 3 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {([['exams','Passar nas provas'],['competition','Concurso'],['entrance','Vestibular'],['learn','Aprender'],['other','Outro']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setProfile((current) => ({ ...current, goal: value }))} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 text-left text-sm ${profile.goal === value ? "border-primary bg-primary/5 font-medium" : "hover:bg-accent/50"}`}>{label}{profile.goal === value && <Check className="size-4 text-primary" />}</button>)}
            </div>
          )}
          {step === 4 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">Idioma<select aria-label="Idioma inicial" value={profile.language} onChange={(event) => setProfile((current) => ({ ...current, language: event.target.value as "pt-BR" | "en" }))} className="h-10 rounded-md border bg-background px-3"><option value="pt-BR">Português</option><option value="en">English</option></select></label>
              <label className="grid gap-2 text-sm font-medium">Tema<select aria-label="Tema inicial" value={theme ?? "system"} onChange={(event) => setTheme(event.target.value)} className="h-10 rounded-md border bg-background px-3"><option value="system">Sistema</option><option value="light">Claro</option><option value="dark">Escuro</option><option value="amoled">AMOLED</option></select></label>
              <label className="grid gap-2 text-sm font-medium sm:col-span-2">IA padrão<select aria-label="IA padrão" value={profile.provider} onChange={(event) => setProfile((current) => ({ ...current, provider: event.target.value as typeof profile.provider }))} className="h-10 rounded-md border bg-background px-3">{aiProviderOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
            </div>
          )}
          <div className="mt-6 flex items-center gap-1.5" aria-label={`Etapa ${step + 1} de ${steps.length}`}>
            {steps.map((item, index) => <span key={item.title} className={`h-1.5 flex-1 rounded-full ${index <= step ? "bg-primary" : "bg-muted"}`} />)}
          </div>
          <div className="mt-5 flex items-center justify-between gap-3">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ArrowLeft />Voltar</Button>
            {step < steps.length - 1 ? <Button onClick={() => setStep((value) => value + 1)}>Continuar<ArrowRight /></Button> : <Button onClick={() => void complete(true)}>Importar primeiro material<Upload /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
