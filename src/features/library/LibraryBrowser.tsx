"use client";

import { useRef, useState } from "react";
import { FolderInput, Search, Star, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/useMaterials";
import { useExtraction } from "@/features/extraction/useExtraction";
import type { MaterialFilter } from "@/types/material";
import { LibraryEmptyState, LibraryLoading, LibraryNoResults } from "./LibraryStates";
import { MaterialCard } from "./MaterialCard";
import { filterMaterials, materialFilters } from "./material-utils";
import { OrganizationService, type MaterialDestination } from "@/features/organization/OrganizationService";
import { MaterialService } from "@/services/material-service";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function LibraryBrowser() {
  const { materials, isLoading, refresh } = useMaterials();
  const { records: extractedContents } = useExtraction();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MaterialFilter>("all");
  const searchRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveIds, setMoveIds] = useState<string[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const [destination, setDestination] = useState<MaterialDestination>({ course: "", semester: "", subject: "", topic: "" });
  const results = filterMaterials(materials, query, filter);

  if (isLoading) return <LibraryLoading />;

  function clearFilters() {
    setQuery("");
    setFilter("all");
    searchRef.current?.focus();
  }

  const toggleSelected = (id: string, selected: boolean) => setSelectedIds((current) => {
    const next = new Set(current);
    if (selected) next.add(id); else next.delete(id);
    return next;
  });
  const openMove = (ids: string[]) => {
    const first = materials.find((material) => material.id === ids[0]);
    setDestination({ course: first?.course ?? "", semester: first?.semester ?? "", subject: first?.subject ?? "", topic: first?.topic ?? "" });
    setMoveIds(ids);
  };
  const moveSelected = async () => {
    for (const id of moveIds) await OrganizationService.move(id, destination);
    setMoveIds([]); setSelectedIds(new Set()); await refresh();
  };
  const deleteSelected = async () => {
    for (const id of deleteIds) await OrganizationService.remove(id);
    setDeleteIds([]); setSelectedIds(new Set()); await refresh();
  };
  const favoriteSelected = async () => {
    for (const id of selectedIds) await MaterialService.update(id, { isFavorite: true });
    setSelectedIds(new Set()); await refresh();
  };
  const tagSelected = async () => {
    const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean);
    for (const id of selectedIds) {
      const material = materials.find((item) => item.id === id);
      await MaterialService.update(id, { tags: Array.from(new Set([...(material?.tags ?? []), ...tags])) });
    }
    setTagText(""); setIsTagsOpen(false); setSelectedIds(new Set()); await refresh();
  };

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
      {selectedIds.size > 0 && (
        <div role="toolbar" aria-label="Ações dos materiais selecionados" className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg">
          <strong className="mr-auto text-sm">{selectedIds.size} selecionados</strong>
          <Button size="sm" variant="outline" onClick={() => openMove([...selectedIds])}><FolderInput />Mover</Button>
          <Button size="sm" variant="outline" onClick={() => void favoriteSelected()}><Star />Favoritar</Button>
          <Button size="sm" variant="outline" onClick={() => setIsTagsOpen(true)}><Tags />Adicionar tags</Button>
          <Button size="sm" variant="destructive" onClick={() => setDeleteIds([...selectedIds])}><Trash2 />Excluir</Button>
        </div>
      )}
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
                selected={selectedIds.has(material.id)}
                onSelectedChange={(selected) => toggleSelected(material.id, selected)}
                onMove={() => openMove([material.id])}
                onDelete={() => setDeleteIds([material.id])}
              />
            ))}
          </div>
        )}
      </section>
      <Dialog open={moveIds.length > 0} onOpenChange={(open) => !open && setMoveIds([])}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mover materiais</DialogTitle><DialogDescription>Defina o novo curso, semestre, matéria e tema para {moveIds.length} material(is).</DialogDescription></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">{([['course','Curso'],['semester','Semestre'],['subject','Matéria'],['topic','Tema']] as const).map(([field,label]) => <label key={field} className="grid gap-2 text-sm font-medium">{label}<Input value={destination[field]} onChange={(event) => setDestination((current) => ({ ...current, [field]: event.target.value }))} /></label>)}</div>
          <DialogFooter><Button variant="outline" onClick={() => setMoveIds([])}>Cancelar</Button><Button onClick={() => void moveSelected()} disabled={Object.values(destination).some((value) => !value.trim())}>Mover</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteIds.length > 0} onOpenChange={(open) => !open && setDeleteIds([])}>
        <DialogContent><DialogHeader><DialogTitle>Excluir materiais?</DialogTitle><DialogDescription>Esta ação removerá {deleteIds.length} material(is) e seus dados derivados. Não poderá ser desfeita.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteIds([])}>Cancelar</Button><Button variant="destructive" onClick={() => void deleteSelected()}>Confirmar exclusão</Button></DialogFooter></DialogContent>
      </Dialog>
      <Dialog open={isTagsOpen} onOpenChange={setIsTagsOpen}>
        <DialogContent><DialogHeader><DialogTitle>Adicionar tags</DialogTitle><DialogDescription>Separe múltiplas tags por vírgula.</DialogDescription></DialogHeader><Input aria-label="Tags dos materiais" value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="Prova, revisão, importante" /><DialogFooter><Button variant="outline" onClick={() => setIsTagsOpen(false)}>Cancelar</Button><Button onClick={() => void tagSelected()} disabled={!tagText.trim()}>Adicionar tags</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}
