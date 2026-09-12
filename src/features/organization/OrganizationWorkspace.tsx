"use client";

import { useState } from "react";
import { CheckCircle2, FolderTree, Save } from "lucide-react";
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

  const openRename = (file: Material) => {
    setActiveFile(file);
    setFileName(file.name);
    setAction("rename");
  };

  const openMove = (file: Material) => {
    setActiveFile(file);
    setDestination({
      course: file.course ?? "",
      semester: file.semester ?? "",
      subject: file.subject ?? "",
      topic: file.topic ?? "",
    });
    setAction("move");
  };

  const closeDialog = () => {
    setAction(null);
    setActiveFile(null);
  };

  const saveAction = () => {
    if (!activeFile) return;

    if (action === "rename" && OrganizationService.rename(activeFile.id, fileName)) {
      setMessage("Nome atualizado em todos os registros do material.");
    }

    if (action === "move" && OrganizationService.move(activeFile.id, destination)) {
      setMessage("Material organizado e estudo atualizado.");
    }

    refresh();
    closeDialog();
  };

  const deleteFile = (file: Material) => {
    if (!OrganizationService.remove(file.id)) return;
    refresh();
    setMessage("Material e dados derivados foram removidos.");
  };

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

      <OrganizationTree files={materials} onRename={openRename} onMove={openMove} onDelete={deleteFile} />

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
            <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              type="button"
              onClick={saveAction}
              disabled={action === "rename" ? !fileName.trim() : !destinationComplete}
            >
              <Save className="size-4" aria-hidden="true" />
              Salvar alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
