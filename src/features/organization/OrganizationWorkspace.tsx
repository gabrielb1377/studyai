"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, FolderTree, LoaderCircle, Star, Tags, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useMaterials } from "@/hooks/useMaterials";
import type { Material } from "@/types/material";
import { OrganizationService, type MaterialDestination } from "./OrganizationService";
import { OrganizationTree } from "./OrganizationTree";
import { MaterialService } from "@/services/material-service";

type Action = "rename" | "move" | null;

const emptyDestination: MaterialDestination = {
  course: "",
  semester: "",
  subject: "",
  topic: "",
};

export function OrganizationWorkspace() {
  const router = useRouter();
  const { materials, refresh } = useMaterials();
  const [activeFile, setActiveFile] = useState<Material | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [fileName, setFileName] = useState("");
  const [destination, setDestination] = useState<MaterialDestination>(emptyDestination);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagText, setTagText] = useState("");
  const [bulkMoveIds, setBulkMoveIds] = useState<string[]>([]);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [hasAutoSaved, setHasAutoSaved] = useState(false);
  const lastSavedValue = useRef("");

  const actionValue = action === "rename"
    ? fileName.trim()
    : Object.values(destination).map((value) => value.trim()).join("|");

  const openRename = (file: Material) => {
    setActiveFile(file);
    setFileName(file.name);
    setHasAutoSaved(false);
    lastSavedValue.current = file.name.trim();
    setAction("rename");
  };

  const openMove = (file: Material) => {
    setBulkMoveIds([]);
    setActiveFile(file);
    setDestination({
      course: file.course ?? "",
      semester: file.semester ?? "",
      subject: file.subject ?? "",
      topic: file.topic ?? "",
    });
    setHasAutoSaved(false);
    lastSavedValue.current = [file.course, file.semester, file.subject, file.topic].map((value) => value?.trim() ?? "").join("|");
    setAction("move");
  };
  const openBulkMove = () => {
    const first = materials.find((item) => selectedIds.has(item.id));
    if (!first) return;
    setBulkMoveIds([...selectedIds]);
    setHasAutoSaved(false);
    setActiveFile(first);
    setDestination({ course: first.course ?? "", semester: first.semester ?? "", subject: first.subject ?? "", topic: first.topic ?? "" });
    lastSavedValue.current = [first.course, first.semester, first.subject, first.topic].map((value) => value?.trim() ?? "").join("|");
    setAction("move");
  };
  const openNewDestination = (fileId: string) => {
    const file = materials.find((item) => item.id === fileId);
    if (!file) return;
    setBulkMoveIds([]);
    setHasAutoSaved(false);
    setActiveFile(file);
    setDestination(emptyDestination);
    lastSavedValue.current = "";
    setAction("move");
  };

  const closeDialog = () => {
    setAction(null);
    setActiveFile(null);
    setBulkMoveIds([]);
  };

  const saveAction = async () => {
    if (!activeFile) return;

    if (action === "rename" && await OrganizationService.rename(activeFile.id, fileName)) {
      setMessage("Nome atualizado em todos os registros do material.");
    }

    if (action === "move") {
      const ids = bulkMoveIds.length > 0 ? bulkMoveIds : [activeFile.id];
      for (const id of ids) await OrganizationService.move(id, destination);
      setSelectedIds(new Set());
      setMessage(ids.length > 1 ? "Materiais organizados e estudos atualizados." : "Material organizado e estudo atualizado.");
    }

    await refresh();
  };

  useEffect(() => {
    if (!activeFile || !action || !actionValue || actionValue === lastSavedValue.current) return;
    if (action === "move" && !Object.values(destination).every((value) => value.trim())) return;
    const timeout = window.setTimeout(() => {
      setIsAutoSaving(true);
      void saveAction().then(() => {
        lastSavedValue.current = actionValue;
        setHasAutoSaved(true);
      }).finally(() => setIsAutoSaving(false));
    }, 500);
    return () => window.clearTimeout(timeout);
  // saveAction reads the current dialog state and intentionally runs only after a valid edit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, actionValue, activeFile, destination]);

  const deleteFile = async (file: Material) => {
    if (!await OrganizationService.remove(file.id)) return;
    await refresh();
    setMessage("Material e dados derivados foram removidos.");
  };
  const dropFile = async (fileId: string, nextDestination: MaterialDestination) => {
    if (!await OrganizationService.move(fileId, nextDestination)) return;
    await refresh();
    setMessage("Material movido por arrastar e soltar.");
  };
  const toggleSelected = (fileId: string, selected: boolean) => setSelectedIds((current) => { const next = new Set(current); if (selected) next.add(fileId); else next.delete(fileId); return next; });
  const bulkDelete = async () => { for (const id of selectedIds) await OrganizationService.remove(id); setSelectedIds(new Set()); setConfirmBulkDelete(false); await refresh(); setMessage("Materiais selecionados foram removidos."); };
  const bulkFavorite = async () => { for (const id of selectedIds) await MaterialService.update(id, { isFavorite: true }); setSelectedIds(new Set()); await refresh(); setMessage("Materiais adicionados aos favoritos."); };
  const bulkTags = async () => { const tags = tagText.split(",").map((tag) => tag.trim()).filter(Boolean); for (const id of selectedIds) { const material = materials.find((item) => item.id === id); await MaterialService.update(id, { tags: Array.from(new Set([...(material?.tags ?? []), ...tags])) }); } setSelectedIds(new Set()); setTagsOpen(false); setTagText(""); await refresh(); setMessage("Tags adicionadas aos materiais."); };

  const organizedSubjects = new Set(
    materials.filter((file) => file.studyId).map((file) => `${file.course}|${file.semester}|${file.subject}`),
  ).size;
  const destinationComplete = Object.values(destination).every((value) => value.trim());

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resumo da organização">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Materiais importados</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{materials.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Matérias organizadas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{organizedSubjects}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Fonte</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium">
            <FolderTree className="size-4 text-primary" aria-hidden="true" />
            Materiais importados pelo usuário
          </p>
        </div>
      </section>

      {message && (
        <p role="status" className="rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      {selectedIds.size > 0 && <div role="toolbar" aria-label="Ações dos arquivos selecionados" className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-lg"><strong className="mr-auto text-sm">{selectedIds.size} selecionados</strong><Button size="sm" variant="outline" onClick={openBulkMove}><FolderTree />Mover</Button><Button size="sm" variant="outline" onClick={() => void bulkFavorite()}><Star />Favoritar</Button><Button size="sm" variant="outline" onClick={() => setTagsOpen(true)}><Tags />Adicionar tags</Button><Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)}><Trash2 />Excluir</Button></div>}

      <OrganizationTree files={materials} onRename={openRename} onMove={openMove} onDelete={deleteFile} selectedIds={selectedIds} onSelectedChange={toggleSelected} onDropFile={(fileId, nextDestination) => { void dropFile(fileId, nextDestination); }} onCreateDestination={openNewDestination} />

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {materials.some((material) => !material.studyId)
            ? "Organize os materiais pendentes quando estiver pronto."
            : "Todos os materiais estão vinculados aos seus estudos."}
        </p>
        <Button type="button" className="h-11" onClick={() => router.push("/biblioteca")}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Finalizar organização
        </Button>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "rename" ? "Renomear arquivo" : "Organizar arquivo"}</DialogTitle>
            <DialogDescription>
              {action === "rename"
                ? "O novo nome também será usado no conteúdo extraído."
                : "Informe onde este material pertence. Isso criará ou atualizará o estudo correspondente."}
            </DialogDescription>
          </DialogHeader>
          {action === "rename" ? (
            <Input
              aria-label="Novo nome do arquivo"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
              autoFocus
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {([
                ["course", "Curso"],
                ["semester", "Semestre"],
                ["subject", "Matéria"],
                ["topic", "Tema"],
              ] as const).map(([field, label]) => (
                <label key={field} className="grid gap-2 text-sm font-medium">
                  {label}
                  <Input
                    value={destination[field]}
                    onChange={(event) => setDestination((current) => ({ ...current, [field]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
          )}
          <DialogFooter>
            <p role="status" className="mr-auto flex items-center gap-2 text-xs text-muted-foreground">{isAutoSaving && <LoaderCircle className="size-3.5 animate-spin" />} {isAutoSaving ? "Salvando…" : hasAutoSaved ? "Alterações salvas automaticamente" : destinationComplete || action === "rename" ? "As alterações serão salvas automaticamente" : "Preencha todos os campos"}</p>
            <Button type="button" variant="outline" onClick={closeDialog}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}><DialogContent><DialogHeader><DialogTitle>Excluir materiais selecionados?</DialogTitle><DialogDescription>Os {selectedIds.size} materiais e seus dados derivados serão removidos.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmBulkDelete(false)}>Cancelar</Button><Button variant="destructive" onClick={() => void bulkDelete()}>Confirmar exclusão</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={tagsOpen} onOpenChange={setTagsOpen}><DialogContent><DialogHeader><DialogTitle>Adicionar tags</DialogTitle><DialogDescription>Separe as tags por vírgula.</DialogDescription></DialogHeader><Input aria-label="Tags dos arquivos" value={tagText} onChange={(event) => setTagText(event.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setTagsOpen(false)}>Cancelar</Button><Button disabled={!tagText.trim()} onClick={() => void bulkTags()}>Adicionar tags</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
