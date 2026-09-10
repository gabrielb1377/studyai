"use client";

import { useMemo, useState } from "react";
import { FilePenLine, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import type { StudyNote } from "@/types/note";
import { NoteEditor } from "./NoteEditor";
import { useNotes } from "./useNotes";

export function NotesWorkspace({ study }: { study: StudyRecord }) {
  const { notes, create, save, remove } = useNotes(study.studyId);
  const [selectedNote, setSelectedNote] = useState<StudyNote | null>(null);
  const [query, setQuery] = useState("");
  const visibleNotes = useMemo(() => notes.filter((note) => `${note.title} ${note.content}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR"))), [notes, query]);
  const createNote = () => { const note = create(study.studyId); setSelectedNote(note); };
  return <section aria-labelledby="notes-workspace-title" className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 id="notes-workspace-title" className="text-lg font-semibold tracking-tight">Notas</h2><p className="mt-1 text-sm text-muted-foreground">{notes.length} notas neste tema</p></div><Button type="button" onClick={createNote}><Plus className="size-4" />Nova nota</Button></div><div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]"><aside className="space-y-3"><label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Pesquisar notas" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar notas" className="pl-9" /></label><div className="max-h-72 space-y-1 overflow-y-auto" aria-label="Lista de notas">{visibleNotes.map((note) => <div key={note.id} className={`group flex items-center rounded-lg ${selectedNote?.id === note.id ? "bg-accent" : "hover:bg-accent/60"}`}><button type="button" className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => setSelectedNote(note)}><span className="block truncate text-sm font-medium">{note.title}</span><span className="block truncate text-xs text-muted-foreground">{note.content || "Sem conteúdo"}</span></button><Button type="button" variant="ghost" size="icon-xs" aria-label={`Excluir nota ${note.title}`} onClick={() => { remove(note.id); if (selectedNote?.id === note.id) setSelectedNote(null); }}><Trash2 /></Button></div>)}{visibleNotes.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">Nenhuma nota encontrada.</p>}</div></aside>{selectedNote ? <NoteEditor note={selectedNote} onChange={setSelectedNote} onSave={() => { save(selectedNote); }} /> : <Card className="items-center gap-3 border-dashed p-8 text-center shadow-none"><FilePenLine className="size-8 text-primary" /><h3 className="font-semibold">Registre seus pontos importantes</h3><p className="text-sm text-muted-foreground">Crie uma nota para {study.title}.</p></Card>}</div></section>;
}
