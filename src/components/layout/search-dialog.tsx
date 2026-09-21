"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { navigation } from "@/lib/navigation";
import { SemanticSearchService } from "@/features/semantic/SemanticSearchService";
import type { ConceptSearchMatch } from "@/features/semantic/types";

export function SearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [concepts, setConcepts] = useState<ConceptSearchMatch[]>([]);
  const normalize = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const results = navigation.filter((item) =>
    normalize(item.label).includes(normalize(query)),
  );

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
      setConcepts([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      void SemanticSearchService.search(query, { limit: 5 }).then((result) => {
        if (active) setConcepts(result.concepts);
      }).catch(() => active && setConcepts([]));
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
        <DialogTitle>Onde você quer ir?</DialogTitle>
        <DialogDescription>
          Encontre uma página do seu workspace.
        </DialogDescription>
        <Input
          aria-label="Pesquisar páginas"
          placeholder="Digite o nome de uma página..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="space-y-1" aria-live="polite">
          {results.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
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
          {concepts.length > 0 && <p className="px-3 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Conceitos encontrados</p>}
          {concepts.map((match) => (
            <Link
              key={match.concept.id}
              href={`/estudo?tema=${encodeURIComponent(match.concept.studyId)}&aba=knowledge`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-lg p-3 hover:bg-accent"
            >
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">{Math.round(match.score)}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{match.concept.name}</p><p className="line-clamp-1 text-xs text-muted-foreground">{match.concept.description}</p></div>
              <ArrowUpRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
          {results.length === 0 && concepts.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma página encontrada. Tente “Biblioteca”.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
