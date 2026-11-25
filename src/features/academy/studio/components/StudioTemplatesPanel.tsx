"use client";

import { useState } from "react";
import { Check, FileText, Presentation, Search, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type {
  StudioTemplate,
  StudioDocumentTemplate,
  StudioPedagogicalTemplate,
  StudioPedagogicalTemplateId,
} from "../types";

interface StudioTemplatesPanelProps {
  templates: StudioTemplate[];
  currentTemplate: StudioDocumentTemplate;
  onSelectTemplate: (templateId: StudioDocumentTemplate) => void;
  pedagogicalTemplates?: StudioPedagogicalTemplate[];
  currentPedagogicalTemplate?: StudioPedagogicalTemplateId;
  onSelectPedagogicalTemplate?: (templateId: StudioPedagogicalTemplateId) => void;
  docType?: "document" | "presentation";
}

export function StudioTemplatesPanel({
  templates,
  currentTemplate,
  onSelectTemplate,
  pedagogicalTemplates = [],
  currentPedagogicalTemplate,
  onSelectPedagogicalTemplate,
  docType,
}: StudioTemplatesPanelProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "document" | "presentation">("all");

  const query = search.trim().toLowerCase();

  const filteredPedagogical = pedagogicalTemplates.filter((template) => {
    if (!query) return true;
    return (
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.tags.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const filtered = templates.filter((template) => {
    const matchesSearch =
      !query ||
      template.name.toLowerCase().includes(query) ||
      template.description.toLowerCase().includes(query) ||
      template.tags.some((tag) => tag.toLowerCase().includes(query));
    const matchesFilter = filter === "all" || template.type === filter;
    const matchesType = !docType || template.type === docType;
    return matchesSearch && matchesFilter && matchesType;
  });

  return (
    <div className="space-y-4 p-2">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar template..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8 pl-8 text-xs"
            aria-label="Buscar template"
          />
        </div>
        <Select
          value={filter}
          onValueChange={(value) => setFilter(value as typeof filter)}
          options={[
            { value: "all", label: "Todos" },
            { value: "document", label: "Documentos" },
            { value: "presentation", label: "Apresentações" },
          ]}
          aria-label="Filtrar por tipo"
          className="h-8 text-xs"
        />
      </div>

      {onSelectPedagogicalTemplate && filteredPedagogical.length > 0 ? (
        <section className="space-y-2" aria-labelledby="studio-pedagogical-templates-heading">
          <div className="px-1">
            <h4 id="studio-pedagogical-templates-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Templates pedagógicos
            </h4>
            <p className="text-[11px] text-muted-foreground">
              Estruturas de blocos iniciais para o objetivo do seu estudo.
            </p>
          </div>
          <ul className="grid gap-2">
            {filteredPedagogical.map((template) => {
              const isSelected = currentPedagogicalTemplate === template.id;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => onSelectPedagogicalTemplate(template.id)}
                    className={`group relative w-full rounded-xl border-2 p-3 text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border/60 hover:border-muted/80 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <BookOpen className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="truncate text-sm font-medium">{template.name}</span>
                      {isSelected ? (
                        <span className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                          <Check className="size-2.5" />
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {template.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2" aria-labelledby="studio-visual-templates-heading">
        <div className="px-1">
          <h4 id="studio-visual-templates-heading" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Templates visuais
          </h4>
          <p className="text-[11px] text-muted-foreground">
            Estilo gráfico, cores, tipografia e diagramação sem alterar seus blocos.
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum template encontrado.</p>
            <p className="mt-1 text-xs text-muted-foreground">Ajuste a busca ou o filtro.</p>
          </div>
        ) : (
          <ul className="grid gap-2">
            {filtered.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => onSelectTemplate(template.id)}
                  className={`group relative w-full rounded-xl border-2 p-3 text-left transition-all ${
                    currentTemplate === template.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-transparent hover:border-muted/50 hover:bg-muted/30"
                  }`}
                >
                  <div className="mb-2 flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-primary/10 to-primary/5">
                    {template.type === "presentation" ? (
                      <Presentation className="size-8 text-primary/40" aria-hidden="true" />
                    ) : (
                      <FileText className="size-8 text-primary/40" aria-hidden="true" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{template.name}</span>
                    {currentTemplate === template.id && (
                      <span className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                        <Check className="size-2.5" />
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{template.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {template.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px]">{tag}</Badge>
                    ))}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
