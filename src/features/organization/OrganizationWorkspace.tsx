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
import { organizationDestinations, organizationFiles } from "@/lib/mock/organization";
import type { OrganizationFile } from "@/types/organization";
import { OrganizationTree } from "./OrganizationTree";

type Action = "rename" | "move" | null;

export function OrganizationWorkspace() {
  const router = useRouter();
  const [files, setFiles] = useState<OrganizationFile[]>([...organizationFiles]);
  const [activeFile, setActiveFile] = useState<OrganizationFile | null>(null);
  const [action, setAction] = useState<Action>(null);
  const [fileName, setFileName] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");

  const openRename = (file: OrganizationFile) => {
    setActiveFile(file);
    setFileName(file.name);
    setAction("rename");
  };

  const openMove = (file: OrganizationFile) => {
    setActiveFile(file);
    setDestination(`${file.semester}|${file.subject}`);
    setAction("move");
  };

  const closeDialog = () => {
    setAction(null);
    setActiveFile(null);
  };

  const saveAction = () => {
    if (!activeFile) return;

    if (action === "rename") {
      const nextName = fileName.trim();
      if (!nextName) return;
      setFiles((current) =>
        current.map((file) =>
          file.id === activeFile.id ? { ...file, name: nextName } : file,
        ),
      );
      setMessage("Nome atualizado nesta organização local.");
    }

    if (action === "move") {
      const [semester, subject] = destination.split("|");
      setFiles((current) =>
        current.map((file) =>
          file.id === activeFile.id ? { ...file, semester, subject } : file,
        ),
      );
      setMessage("Arquivo movido nesta organização local.");
    }

    closeDialog();
  };

  const deleteFile = (file: OrganizationFile) => {
    setFiles((current) => current.filter((item) => item.id !== file.id));
    setMessage("Arquivo removido desta organização local.");
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Resumo da organização">
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Materiais na árvore</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{files.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm">
          <p className="text-sm text-muted-foreground">Matérias organizadas</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {new Set(files.map((file) => file.subject)).size}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-5 shadow-sm sm:col-span-2 lg:col-span-1">
          <p className="text-sm text-muted-foreground">Modo</p>
          <p className="mt-2 flex items-center gap-2 text-sm font-medium">
            <FolderTree className="size-4 text-primary" aria-hidden="true" />
            Dados mockados locais
          </p>
        </div>
      </section>

      {message && (
        <p role="status" className="rounded-lg border bg-secondary/50 px-4 py-3 text-sm text-muted-foreground">
          {message}
        </p>
      )}

      <OrganizationTree
        files={files}
        onRename={openRename}
        onMove={openMove}
        onDelete={deleteFile}
      />

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          As alterações são visuais e permanecem apenas nesta sessão.
        </p>
        <Button type="button" className="h-11" onClick={() => router.push("/biblioteca")}>
          <CheckCircle2 className="size-4" aria-hidden="true" />
          Finalizar organização
        </Button>
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action === "rename" ? "Renomear arquivo" : "Mover arquivo"}</DialogTitle>
            <DialogDescription>
              {action === "rename"
                ? "Escolha um novo nome para este material mockado."
                : "Escolha a matéria de destino para este material mockado."}
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
            <label className="grid gap-2 text-sm font-medium">
              Destino
              <select
                aria-label="Destino do arquivo"
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                {organizationDestinations.map((item) => (
                  <option key={`${item.semester}-${item.subject}`} value={`${item.semester}|${item.subject}`}>
                    {item.semester} — {item.subject}
                  </option>
                ))}
              </select>
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button type="button" onClick={saveAction} disabled={action === "rename" && !fileName.trim()}>
              <Save className="size-4" aria-hidden="true" />
              Salvar alteração
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
