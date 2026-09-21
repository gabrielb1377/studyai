"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BookOpen, Network, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useKnowledgeGraphs } from "./useKnowledgeGraphs";

const kindLabels = {
  concept: "Conceito", entity: "Entidade", technical_term: "Termo técnico", acronym: "Sigla", formula: "Fórmula",
  technology: "Tecnologia", person: "Pessoa", organization: "Organização", example: "Exemplo", observation: "Observação",
};

const relationLabels = {
  defines: "define", related_to: "relaciona-se a", depends_on: "depende de", prerequisite_of: "é pré-requisito de",
  example_of: "é exemplo de", uses: "utiliza", part_of: "faz parte de", abbreviation_of: "abrevia", references: "referencia",
};

export function KnowledgeMapView({ studyId }: { studyId: string }) {
  const { graphs, isLoading } = useKnowledgeGraphs(studyId);
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("Todos");
  const [selectedId, setSelectedId] = useState<string>();
  const concepts = useMemo(() => graphs.flatMap((graph) => graph.concepts), [graphs]);
  const relations = useMemo(() => graphs.flatMap((graph) => graph.relations), [graphs]);
  const chapters = useMemo(() => ["Todos", ...new Set(concepts.map((concept) => concept.chapter).filter((value): value is string => Boolean(value)))], [concepts]);
  const filtered = concepts.filter((concept) => (chapter === "Todos" || concept.chapter === chapter) && [concept.name, concept.description, ...concept.aliases].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  const selected = concepts.find((concept) => concept.id === selectedId) ?? filtered[0];
  const selectedRelations = selected ? relations.filter((relation) => relation.sourceId === selected.id || relation.targetId === selected.id) : [];

  if (isLoading) return <Card className="p-8 text-center text-sm text-muted-foreground shadow-none">Carregando mapa de conhecimento…</Card>;
  if (concepts.length === 0) return <Card className="items-center gap-3 p-10 text-center shadow-none"><Network className="size-9 text-muted-foreground" /><h2 className="font-semibold">Mapa ainda não disponível</h2><p className="max-w-md text-sm text-muted-foreground">Reimporte ou processe um material com conteúdo textual para identificar conceitos e relações.</p></Card>;

  return (
    <section aria-labelledby="knowledge-map-title" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="knowledge-map-title" className="text-lg font-semibold">Mapa de Conhecimento</h2><p className="text-sm text-muted-foreground">Explore conceitos, dependências e exemplos extraídos dos seus materiais.</p></div><div className="flex gap-2"><Badge variant="secondary">{concepts.length} conceitos</Badge><Badge variant="outline">{relations.length} relações</Badge></div></div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="relative"><Search className="absolute left-3 top-3 size-4 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conceito, sigla ou definição…" className="pl-9" /></div>
        <div className="flex max-w-full gap-2 overflow-x-auto">{chapters.map((item) => <Button key={item} size="sm" variant={chapter === item ? "secondary" : "ghost"} onClick={() => setChapter(item)}>{item}</Button>)}</div>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="gap-3 p-4 shadow-none"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{filtered.map((concept) => <button key={concept.id} type="button" onClick={() => setSelectedId(concept.id)} className={`min-h-24 rounded-xl border p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected?.id === concept.id ? "border-primary/50 bg-primary/5" : ""}`}><span className="mb-2 flex items-center justify-between gap-2"><Badge variant="outline">{kindLabels[concept.kind]}</Badge><span className="text-[11px] text-muted-foreground">{concept.relationIds.length} conexões</span></span><strong className="line-clamp-2 text-sm">{concept.name}</strong><span className="mt-1 block line-clamp-2 text-xs leading-5 text-muted-foreground">{concept.description}</span></button>)}</div>{filtered.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Nenhum conceito corresponde aos filtros.</p>}</Card>
        <Card className="gap-4 p-4 shadow-none xl:sticky xl:top-20">
          {selected ? <><div><Badge>{kindLabels[selected.kind]}</Badge><h3 className="mt-3 text-base font-semibold">{selected.name}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.description}</p></div>{selected.aliases.length > 0 && <p className="text-xs"><strong>Também conhecido como:</strong> {selected.aliases.join(", ")}</p>}<dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Capítulo</dt><dd className="mt-1 font-medium">{selected.chapter ?? "Geral"}</dd></div><div><dt className="text-muted-foreground">Documento</dt><dd className="mt-1 truncate font-medium" title={selected.document}>{selected.document}</dd></div></dl><div><h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conexões</h4><div className="space-y-2">{selectedRelations.map((relation) => { const otherId = relation.sourceId === selected.id ? relation.targetId : relation.sourceId; const other = concepts.find((concept) => concept.id === otherId); return other ? <button key={relation.id} type="button" onClick={() => setSelectedId(other.id)} className="flex w-full items-center gap-2 rounded-lg border p-2 text-left text-xs hover:bg-accent"><BookOpen className="size-3.5 text-primary" /><span className="min-w-0 flex-1"><span className="text-muted-foreground">{relationLabels[relation.kind]}</span><br /><strong>{other.name}</strong></span><ArrowRight className="size-3.5" /></button> : null; })}{selectedRelations.length === 0 && <p className="text-xs text-muted-foreground">Conceito isolado neste material.</p>}</div></div></> : null}
        </Card>
      </div>
    </section>
  );
}
