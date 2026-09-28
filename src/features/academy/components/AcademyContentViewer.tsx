"use client";

import { useState } from "react";
import { BookOpen, BookOpenCheck, Brain, CheckCircle2, Download, FileText, GraduationCap, ListChecks, Presentation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { academyLabels, type AcademyExportKind, type AcademyGeneratedContent, type AcademyStudy } from "../types";

export function AcademyContentViewer({ study, content, open, onOpenChange, onOpenProfessor, onExport, exportingKind }: {
  study: AcademyStudy;
  content?: AcademyGeneratedContent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenProfessor: () => void;
  onExport: (kind: AcademyExportKind) => Promise<unknown>;
  exportingKind?: AcademyExportKind;
}) {
  const [exportError, setExportError] = useState<string>();
  if (!content) return null;
  const contentExports = study.exports.filter((item) => item.contentId === content.id);
  async function runExport(kind: AcademyExportKind) {
    setExportError(undefined);
    try { await onExport(kind); }
    catch (cause) { setExportError(cause instanceof Error ? cause.message : "Não foi possível exportar o conteúdo."); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <div className="flex flex-wrap gap-2"><Badge>{academyLabels.contentKinds[content.kind]}</Badge><Badge variant="outline">{content.provider} · {content.model}</Badge></div>
          <DialogTitle className="text-xl">{content.title}</DialogTitle>
          <DialogDescription>{study.subject} · {study.topic} — {content.objective}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
          <div className="space-y-6">
            {content.chapters.map((chapter) => (
              <article key={chapter.id} className="rounded-2xl border bg-card p-5">
                <h3 className="flex items-center gap-2 font-semibold"><BookOpen className="size-4 text-primary" />{chapter.title}</h3>
                {chapter.objective ? <p className="mt-2 text-sm font-medium text-muted-foreground">{chapter.objective}</p> : null}
                <div className="mt-4 whitespace-pre-wrap text-sm leading-7">{chapter.content}</div>
                {chapter.examples.length ? <div className="mt-4 rounded-xl bg-secondary/55 p-4 text-sm"><strong>Exemplos</strong><ul className="mt-2 list-disc space-y-1 pl-5">{chapter.examples.map((example) => <li key={example}>{example}</li>)}</ul></div> : null}
              </article>
            ))}
            <section className="rounded-2xl border p-5"><h3 className="font-semibold">Resumo</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{content.summary}</p></section>
          </div>
          <aside className="space-y-3">
            <div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Módulos</p><p className="mt-1 flex items-center gap-2 font-semibold"><GraduationCap className="size-4 text-primary" />{content.modules.length}</p></div>
            <div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Flashcards</p><p className="mt-1 flex items-center gap-2 font-semibold"><Brain className="size-4 text-primary" />{content.flashcards.length}</p></div>
            <div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Questões</p><p className="mt-1 flex items-center gap-2 font-semibold"><ListChecks className="size-4 text-primary" />{content.quiz.length}</p></div>
            <div className="rounded-2xl border p-4"><p className="text-xs text-muted-foreground">Exercícios</p><p className="mt-1 flex items-center gap-2 font-semibold"><CheckCircle2 className="size-4 text-primary" />{content.exercises.length}</p></div>
            <section className="space-y-2 rounded-2xl border p-4" aria-labelledby="academy-export-title">
              <div><h3 id="academy-export-title" className="text-sm font-semibold">Exportar</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">O Mermaid será preservado como fonte editável.</p></div>
              <Button className="w-full justify-start" size="sm" variant="outline" disabled={Boolean(exportingKind)} onClick={() => void runExport("pdf")}><FileText />{exportingKind === "pdf" ? "Gerando PDF..." : "Baixar PDF"}</Button>
              <Button className="w-full justify-start" size="sm" variant="outline" disabled={Boolean(exportingKind)} onClick={() => void runExport("workbook")}><BookOpenCheck />{exportingKind === "workbook" ? "Gerando apostila..." : "Baixar apostila"}</Button>
              <Button className="w-full justify-start" size="sm" variant="outline" disabled={Boolean(exportingKind)} onClick={() => void runExport("presentation")}><Presentation />{exportingKind === "presentation" ? "Gerando slides..." : "Baixar apresentação"}</Button>
              {contentExports.length ? <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Download className="size-3.5" />{contentExports.length} {contentExports.length === 1 ? "exportação salva" : "exportações salvas"}</p> : null}
            </section>
          </aside>
        </div>
        {exportError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{exportError}</p> : null}
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button><Button onClick={onOpenProfessor}><GraduationCap />Abrir no Professor</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
