"use client";

import { useRef } from "react";
import { Bold, Code2, Italic, List, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StudyNote } from "@/types/note";

export function NoteEditor({ note, onChange }: { note: StudyNote; onChange: (note: StudyNote) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insert = (before: string, after = "") => { const textarea = textareaRef.current; if (!textarea) return; const start = textarea.selectionStart; const end = textarea.selectionEnd; const selected = note.content.slice(start, end) || "texto"; const content = `${note.content.slice(0, start)}${before}${selected}${after}${note.content.slice(end)}`; onChange({ ...note, content }); requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(start + before.length, start + before.length + selected.length); }); };
  return <section aria-labelledby="note-editor-title" className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 id="note-editor-title" className="text-lg font-semibold tracking-tight">Editor de nota</h2><span className="text-xs text-muted-foreground">Salvo automaticamente</span></div><Input aria-label="Título da nota" value={note.title} onChange={(event) => onChange({ ...note, title: event.target.value })} placeholder="Título da nota" /><div className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"><Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar título" onClick={() => insert("## ")}><Type /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar negrito" onClick={() => insert("**", "**")}><Bold /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar itálico" onClick={() => insert("_", "_")}><Italic /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar lista" onClick={() => insert("- ")}><List /></Button><Button type="button" variant="ghost" size="icon-sm" aria-label="Adicionar código" onClick={() => insert("```\n", "\n```")}><Code2 /></Button></div><textarea ref={textareaRef} aria-label="Conteúdo da nota" value={note.content} onChange={(event) => onChange({ ...note, content: event.target.value })} placeholder="Escreva em Markdown..." className="min-h-64 w-full resize-y rounded-lg border bg-background p-3 text-sm leading-6 outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring" /></section>;
}
