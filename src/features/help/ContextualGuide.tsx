"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExperiencePreferencesService, useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";

const guides: Record<string, { id: string; title: string; description: string }> = {
  "/importar": { id: "import", title: "Importe do seu jeito", description: "Arraste arquivos, escolha uma pasta ou use o compartilhamento do dispositivo. O processamento acontece localmente." },
  "/estudo": { id: "workspace", title: "Seu Workspace", description: "Abra ferramentas lado a lado, redimensione painéis e escolha um layout. Tudo é salvo automaticamente." },
  "/tutor": { id: "tutor", title: "Tutor com contexto", description: "Abra um tema antes de perguntar. Assim, o Tutor usa somente os materiais relacionados ao seu estudo." },
};

export function ContextualGuide() {
  const pathname = usePathname();
  const preferences = useExperiencePreferences();
  const [visible, setVisible] = useState(false);
  const guide = guides[pathname];
  useEffect(() => {
    if (!guide || navigator.webdriver || preferences.dismissedGuides.includes(guide.id)) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 800);
    return () => window.clearTimeout(timer);
  }, [guide, preferences.dismissedGuides]);
  if (!guide || !visible) return null;
  return (
    <aside className="fixed bottom-36 right-4 z-30 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-background p-4 shadow-xl sm:right-5 lg:bottom-20" aria-label="Dica desta tela">
      <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-4" /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold">{guide.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{guide.description}</p></div><Button size="icon-xs" variant="ghost" aria-label="Fechar dica" onClick={() => { ExperiencePreferencesService.dismissGuide(guide.id); setVisible(false); }}><X /></Button></div>
    </aside>
  );
}
