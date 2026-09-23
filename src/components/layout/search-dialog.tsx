"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, BookOpen, Bot, BrainCircuit, CircleHelp, FileText, Network, NotebookPen, Search, Settings, Sparkles, Upload } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { navigation } from "@/lib/navigation";
import { GlobalSearchService, type GlobalSearchResult } from "@/features/search/GlobalSearchService";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";
import { helpTopics } from "@/features/help/help-content";

const quickCommands = [
  { title: "Importar material", description: "Adicionar PDF, documento, áudio ou vídeo", href: "/importar", icon: Upload },
  { title: "Abrir Tutor", description: "Continuar uma conversa contextual", href: "/tutor", icon: Bot },
  { title: "Criar Flashcards", description: "Abrir a ferramenta no Workspace", href: "/estudo", icon: BrainCircuit },
  { title: "Fazer Quiz", description: "Praticar o tema atual", href: "/estudo", icon: BookOpen },
  { title: "Configurar o StudyAI", description: "Interface, IA, armazenamento e conta", href: "/configuracoes", icon: Settings },
] as const;

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [workspaceResults, setWorkspaceResults] = useState<GlobalSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const preferences = useExperiencePreferences();
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const term = normalize(query);
  const results = navigation.filter((item) => (!item.advanced || preferences.mode === "advanced") && normalize(`${item.label} ${item.description}`).includes(term));
  const commands = query.trim().length < 2 ? quickCommands : quickCommands.filter((item) => normalize(`${item.title} ${item.description}`).includes(term));
  const guides = query.trim().length < 2 ? [] : helpTopics.filter((item) => {
    const content = normalize(`${item.title} ${item.description} ${item.keywords.join(" ")}`);
    return term.split(/\s+/).filter(Boolean).every((token) => content.includes(token));
  }).slice(0, 3);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setWorkspaceResults([]);
      setIsSearching(false);
      return;
    }
    let active = true;
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      void GlobalSearchService.search(query).then((result) => {
        if (active) setWorkspaceResults(result);
      }).catch(() => active && setWorkspaceResults([])).finally(() => active && setIsSearching(false));
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [open, query]);

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <DialogTrigger asChild>
        <button
          className="flex h-10 min-w-0 items-center gap-2.5 rounded-lg border border-transparent px-2 text-sm text-muted-foreground transition-colors hover:border-border hover:bg-muted sm:w-72 sm:px-3"
          aria-label="Pesquisar no workspace"
        >
          <Search className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="hidden truncate sm:block">
            Pesquisar no workspace...
          </span>
          <kbd className="ml-auto hidden rounded border bg-card px-1.5 py-0.5 text-[10px] sm:block">
            Ctrl K
          </kbd>
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Pesquisa Global</DialogTitle>
        <DialogDescription>
          Encontre materiais, notas, resumos, flashcards, quizzes e conceitos.
        </DialogDescription>
        <Input
          aria-label="Pesquisar páginas"
          placeholder="Pesquisar em todo o StudyAI..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            document.querySelector<HTMLElement>("[data-command-item]")?.focus();
          }}
        />
        <div className="space-y-1" aria-live="polite">
          {commands.length > 0 && <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ações rápidas</p>}
          {commands.map(({ href, title, description, icon: Icon }) => (
            <Link key={title} data-command-item href={href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent focus:bg-accent">
              <Icon className="size-5 text-muted-foreground" /><div className="flex-1"><p className="text-sm font-medium">{title}</p><p className="text-xs text-muted-foreground">{description}</p></div><ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {results.length > 0 && <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Páginas</p>}
          {results.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              data-command-item
              href={href}
              onClick={(event) => {
                event.preventDefault();
                setOpen(false);
                router.push(href);
              }}
              className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent"
            >
              <Icon className="size-5 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {guides.length > 0 && <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ajuda</p>}
          {guides.map((guide) => <button key={guide.id} data-command-item type="button" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("studyai:open-help", { detail: { id: guide.id } })); }} className="flex w-full items-center gap-3 rounded-lg p-3 text-left hover:bg-accent focus:bg-accent"><CircleHelp className="size-5 text-muted-foreground" /><span className="flex-1"><span className="block text-sm font-medium">{guide.title}</span><span className="block text-xs text-muted-foreground">{guide.description}</span></span><ArrowUpRight className="size-4 text-muted-foreground" /></button>)}
          {workspaceResults.length > 0 && <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conhecimento encontrado</p>}
          {workspaceResults.map((result) => {
            const category = { material: [FileText, "Material"], note: [NotebookPen, "Nota"], summary: [Sparkles, "Resumo"], flashcard: [BrainCircuit, "Flashcard"], quiz: [BookOpen, "Quiz"], concept: [Network, "Conceito"], knowledge: [Network, "Relação"] }[result.category] as [typeof FileText, string];
            const Icon = category[0];
            return (
            <Link
              key={`${result.category}:${result.id}`}
              data-command-item
              href={result.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="size-4" /></span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{result.title}</p><p className="line-clamp-1 text-xs text-muted-foreground">{category[1]} · {result.preview || `${Math.round(result.score)}% de correspondência`}</p></div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          );})}
          {isSearching && <p className="py-6 text-center text-sm text-muted-foreground">Pesquisando em todo o workspace…</p>}
          {!isSearching && results.length === 0 && workspaceResults.length === 0 && commands.length === 0 && guides.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma página encontrada. Tente “Biblioteca”.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
