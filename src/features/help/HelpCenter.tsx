"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleHelp, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { helpTopics } from "./help-content";

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function HelpCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<(typeof helpTopics)[number] | null>(null);
  useEffect(() => {
    const show = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      setSelected(helpTopics.find((topic) => topic.id === id) ?? null);
      setOpen(true);
    };
    window.addEventListener("studyai:open-help", show);
    return () => window.removeEventListener("studyai:open-help", show);
  }, []);
  const topics = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return helpTopics;
    const tokens = term.split(/\s+/).filter(Boolean);
    return helpTopics.filter((topic) => {
      const content = normalize(`${topic.title} ${topic.description} ${topic.keywords.join(" ")}`);
      return tokens.every((token) => content.includes(token));
    });
  }, [query]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        className="help-trigger fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 rounded-full shadow-lg sm:right-5 lg:bottom-5"
        onClick={() => setOpen(true)}
        aria-label="Abrir Central de Ajuda"
      >
        <CircleHelp />
        <span className="hidden sm:inline">Ajuda</span>
      </Button>
      <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) { setSelected(null); setQuery(""); } }}>
        <DialogContent className="max-h-[min(760px,90dvh)] max-w-3xl overflow-hidden p-0">
          <div className="border-b px-5 py-5 sm:px-7">
            <DialogTitle className="text-xl">{selected?.title ?? "Como podemos ajudar?"}</DialogTitle>
            <DialogDescription className="mt-1.5">
              {selected?.description ?? "Encontre respostas rápidas sem sair do que está fazendo."}
            </DialogDescription>
          </div>
          {selected ? (
            <div className="overflow-y-auto px-5 py-5 sm:px-7">
              <ol className="space-y-3">
                {selected.steps.map((step, index) => (
                  <li key={step} className="flex gap-3 rounded-xl border bg-muted/30 p-4 text-sm leading-6">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-6 flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setSelected(null)}><X />Voltar aos guias</Button>
                <Button onClick={() => { setOpen(false); router.push(selected.href); }}>
                  Abrir no StudyAI <ArrowRight />
                </Button>
              </div>
            </div>
          ) : (
            <div className="min-h-0 overflow-y-auto px-5 pb-6 sm:px-7">
              <div className="sticky top-0 z-10 bg-background py-4">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Ex.: Como importar PDF?" autoFocus />
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {topics.map((topic) => {
                  const Icon = topic.icon;
                  return (
                    <button key={topic.id} type="button" onClick={() => setSelected(topic)} className="group flex min-h-24 items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
                      <span className="min-w-0"><span className="block text-sm font-semibold">{topic.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{topic.description}</span></span>
                    </button>
                  );
                })}
              </div>
              {topics.length === 0 && <p className="py-12 text-center text-sm text-muted-foreground">Nenhum guia encontrado. Tente “Tutor”, “PDF” ou “sincronização”.</p>}
              <p className="mt-5 text-center text-xs text-muted-foreground">Atalho: pressione <kbd className="rounded border bg-muted px-1.5 py-0.5">Ctrl K</kbd> para páginas, comandos e conteúdo.</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
