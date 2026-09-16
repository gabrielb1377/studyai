"use client";

import { useRef, useState } from "react";
import { Search, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/useMaterials";
import { useExtraction } from "@/features/extraction/useExtraction";
import type { MaterialFilter } from "@/types/material";
import { LibraryEmptyState, LibraryLoading, LibraryNoResults } from "./LibraryStates";
import { MaterialCard } from "./MaterialCard";
import { filterMaterials, materialFilters } from "./material-utils";

export function LibraryBrowser() {
  const { materials, isLoading } = useMaterials();
  const { records: extractedContents } = useExtraction();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const results = filterMaterials(materials, query, filter);

  if (isLoading) return <LibraryLoading />;

  function clearFilters() {
    setQuery("");
    setFilter("all");
    searchRef.current?.focus();
  }

  return (
    <div className="space-y-6">
      <div
        role="search"
        aria-label="Pesquisa de materiais"
        className="relative max-w-md"
      >
        <Search
          className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={searchRef}
          aria-label="Pesquisar material"
          placeholder="Pesquisar material..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-11 bg-card pl-10 pr-12 shadow-none"
        />
        {query && (
          <Button
            size="icon"
            variant="ghost"
            className="absolute right-0.5 top-0.5 size-10"
            aria-label="Limpar pesquisa"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <div
        role="group"
        aria-label="Filtrar materiais"
        className="flex flex-wrap gap-2"
      >
        {materialFilters.map((item) => (
          <Button
            key={item.value}
            variant={filter === item.value ? "secondary" : "ghost"}
            aria-pressed={filter === item.value}
            onClick={() => setFilter(item.value)}
            className="h-11 px-4"
          >
            {item.value === "favorites" && (
              <Star className="size-4" aria-hidden="true" />
            )}
            {item.label}
          </Button>
        ))}
      </div>
      <section aria-labelledby="materials-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
          <h2 id="materials-heading" className="text-sm font-medium">
            <span role="status" aria-live="polite">
              {results.length} {results.length === 1 ? "material" : "materiais"}
              {query.trim() || filter !== "all"
                ? results.length === 1
                  ? " encontrado"
                  : " encontrados"
                : " na biblioteca"}
            </span>
          </h2>
          <span className="text-xs text-muted-foreground">Dados importados neste dispositivo</span>
        </div>
        {materials.length === 0 ? (
          <LibraryEmptyState />
        ) : results.length === 0 ? (
          <LibraryNoResults onClear={clearFilters} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {results.map((material) => (
              <MaterialCard
                key={material.id}
                material={material}
                content={extractedContents.find((content) => content.fileId === material.fileId)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
