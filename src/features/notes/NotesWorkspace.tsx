"use client";

import { useEffect, useMemo, useState } from "react";
import { FilePenLine, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import type { StudyNote } from "@/types/note";
import { NoteEditor } from "./NoteEditor";
import { useNotes } from "./useNotes";
import { WorkspacePersistence } from "@/features/study/services/WorkspacePersistence";
import { useMaterials } from "@/hooks/useMaterials";
import { useKnowledgeGraphs } from "@/features/semantic/useKnowledgeGraphs";
import type { NoteLinkTarget } from "./NoteEditor";

export function NotesWorkspace({ study, panelId }: { study: StudyRecord; panelId?: string }) {
  const { notes, create, save, remove } = useNotes(study.studyId);
  const { materials } = useMaterials();
  const { graphs } = useKnowledgeGraphs(study.studyId);
  const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
  const [query, setQuery] = useState("");
  const visibleNotes = useMemo(() => notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [notes, query]);
  const linkTargets = useMemo<NoteLinkTarget[]>(() => [
    ...notes.filter((note) => note.id !== selectedNote?.id).map((note) => ({ kind: "nota" as const, id: note.id, label: `Nota · ${note.title}` })),
    ...materials.filter((material) => material.studyId === study.studyId).map((material) => ({ kind: "pdf" as const, id: material.id, label: `Material · ${material.name}` })),
    ...graphs.flatMap((graph) => {
      const material = materials.find((item) => item.fileId === graph.fileId);
      if (!material) return [];
      return [...new Set(graph.blocks.map((block) => block.chapter).filter((chapter): chapter is string => Boolean(chapter)))].map((chapter, chapterIndex) => {
        const page = graph.blocks.find((block) => block.chapter === chapter)?.page;
        return { kind: "capitulo" as const, id: `${material.id}::${chapterIndex}::${page ?? ""}`, label: `Capítulo · ${chapter}` };
      });
    }),
    ...graphs.flatMap((graph) => graph.concepts.map((concept) => ({ kind: "conceito" as const, id: concept.id, label: `Conceito · ${concept.name}` }))),
  ], [graphs, materials, notes, selectedNote?.id, study.studyId]);
  useEffect(() => {
    const panelKey = panelId ? `studyai:workspace-note:${study.studyId}:${panelId}` : null;
    const storedId = panelKey ? window.localStorage.getItem(panelKey) ?? undefined : WorkspacePersistence.load(study.studyId).noteId;
    if (!selectedNote && storedId) setSelectedNote(notes.find((note) => note.id === storedId) ?? null);
  }, [notes, panelId, selectedNote, study.studyId]);
  useEffect(() => {
    if (!selectedNote) return;
    if (panelId) window.localStorage.setItem(`studyai:workspace-note:${study.studyId}:${panelId}`, selectedNote.id);
    else WorkspacePersistence.save(study.studyId, { noteId: selectedNote.id });
    const timeout = window.setTimeout(() => save(selectedNote), 400);
    return () => { window.clearTimeout(timeout); save(selectedNote); };
  }, [panelId, save, selectedNote, study.studyId]);
  const selectNote = (note: StudyNote | null) => { setSelectedNote(note); if (panelId) { const key = `studyai:workspace-note:${study.studyId}:${panelId}`; if (note) window.localStorage.setItem(key, note.id); else window.localStorage.removeItem(key); } else WorkspacePersistence.save(study.studyId, { noteId: note?.id }); };
  const createNote = () => { const note = create(study.studyId); selectNote(note); };
  const openLink = (target: NoteLinkTarget) => {
    if (target.kind === "nota") { const note = notes.find((item) => item.id === target.id); if (note) selectNote(note); return; }
    if (target.kind === "capitulo") {
      const [materialId, chapterIndex, page] = target.id.split("::");
      window.dispatchEvent(new CustomEvent("studyai:workspace-open", { detail: { type: "material", resourceId: materialId } }));
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("studyai:pdf-chapter", { detail: { materialId, chapterIndex: Number(chapterIndex), page: page ? Number(page) : undefined } })), 0);
      return;
    }
    window.dispatchEvent(new CustomEvent("studyai:workspace-open", { detail: { type: target.kind === "pdf" ? "material" : "knowledge", resourceId: target.kind === "pdf" ? target.id : undefined } }));
  };
  return <section aria-labelledby="notes-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="notes-workspace-title" className="text-lg font-semibold tracking-tight">Notas</h2><p className="mt-1 text-sm text-muted-foreground">{notes.length} notas neste tema · salvamento automático · links Wiki</p></div><Button type="button" onClick={createNote}><Plus className="size-4" />Nova nota</Button></div><div className="grid gap-4 2xl:grid-cols-[14rem_minmax(0,1fr)]"><aside className="space-y-3"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Pesquisar notas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar notas" className="pl-9" /></label><div className="max-h-72 space-y-1 overflow-y-auto" aria-label="Lista de notas">{visibleNotes.map((note) => <div key={note.id} className={`group flex items-center rounded-lg ${selectedNote?.id === note.id ? "bg-accent" : "hover:bg-accent/60"}`}><button type="button" className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => selectNote(note)}><span className="block truncate text-sm font-medium">{note.title}</span><span className="block truncate text-xs text-muted-foreground">{note.content || "Sem conteúdo"}</span></button><Button type="button" variant="ghost" size="icon-xs" aria-label={`Excluir nota ${note.title}`} onClick={() => { remove(note.id); if (selectedNote?.id === note.id) selectNote(null); }}><Trash2 /></Button></div>)}{visibleNotes.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Nenhuma nota encontrada.</p>}</div></aside>{selectedNote ? <NoteEditor note={selectedNote} onChange={setSelectedNote} linkTargets={linkTargets} onOpenLink={openLink} /> : <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none"><FilePenLine className="size-8 text-primary" /><h3 className="font-semibold">Registre seus pontos importantes</h3><p className="text-sm text-muted-foreground">Crie uma nota para {study.title}.</p></Card>}</div></section>;
}
