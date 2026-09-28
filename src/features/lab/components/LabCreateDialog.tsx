"use client";

import { useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import { labLanguageLabels, labLanguages, type CreateLabProjectInput, type LabLanguage } from "../types";

export function LabCreateDialog({ studies, defaultStudyId, onCreate }: { studies: readonly StudyRecord[]; defaultStudyId?: string; onCreate: (input: CreateLabProjectInput) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<LabLanguage>("javascript");
  const [studyId, setStudyId] = useState(defaultStudyId ?? "");
  const [isCreating, setIsCreating] = useState(false);
  const submit = async () => {
    const study = studies.find((item) => item.studyId === studyId);
    setIsCreating(true);
    try { await onCreate({ title, language, studyId: study?.studyId, subject: study?.subject, topic: study?.title }); setOpen(false); setTitle(""); }
    finally { setIsCreating(false); }
  };
  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button><Plus />Novo exercício</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Criar exercício de laboratório</DialogTitle><DialogDescription>Escolha uma linguagem e, se desejar, relacione a prática a um tema existente.</DialogDescription></DialogHeader><div className="space-y-4"><label className="grid gap-2 text-sm font-medium">Título<Input aria-label="Título do exercício" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Consultas SQL básicas" maxLength={160} /></label><label className="grid gap-2 text-sm font-medium">Linguagem<select aria-label="Linguagem inicial" value={language} onChange={(event) => setLanguage(event.target.value as LabLanguage)} className="h-10 rounded-lg border bg-background px-3 text-sm">{labLanguages.map((item) => <option key={item} value={item}>{labLanguageLabels[item]}</option>)}</select></label><label className="grid gap-2 text-sm font-medium">Tema<select aria-label="Tema relacionado" value={studyId} onChange={(event) => setStudyId(event.target.value)} className="h-10 rounded-lg border bg-background px-3 text-sm"><option value="">Estudo livre</option>{studies.map((study) => <option key={study.studyId} value={study.studyId}>{study.subject} · {study.title}</option>)}</select></label></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => void submit()} disabled={!title.trim() || isCreating}><FlaskConical />{isCreating ? "Criando…" : "Criar laboratório"}</Button></DialogFooter></DialogContent></Dialog>;
}
