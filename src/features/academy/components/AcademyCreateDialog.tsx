"use client";

import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  academyDepths,
  academyGoals,
  academyLabels,
  academyLanguages,
  academyLevels,
  academyStyles,
  type CreateAcademyStudyInput,
} from "../types";

const initialInput: CreateAcademyStudyInput = {
  topic: "",
  subject: "",
  level: "basic",
  goal: "college",
  duration: 45,
  language: "pt-BR",
  depth: "balanced",
  style: "structured",
};

const selectClassName = "h-11 w-full rounded-xl border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/35";

export function AcademyCreateDialog({ onCreate, isCreating }: {
  onCreate: (input: CreateAcademyStudyInput) => Promise<unknown>;
  isCreating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(initialInput);
  const [formError, setFormError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    try {
      await onCreate(input);
      setInput(initialInput);
      setOpen(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Revise os campos e tente novamente.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg"><Plus />Criar estudo livre</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar estudo livre</DialogTitle>
          <DialogDescription>Defina o que você quer estudar. O conteúdo será criado em uma etapa futura.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">Tema
              <Input required minLength={2} value={input.topic} onChange={(event) => setInput((current) => ({ ...current, topic: event.target.value }))} placeholder="Ex.: Estruturas de dados" />
            </label>
            <label className="grid gap-2 text-sm font-medium">Matéria
              <Input required minLength={2} value={input.subject} onChange={(event) => setInput((current) => ({ ...current, subject: event.target.value }))} placeholder="Ex.: Algoritmos" />
            </label>
            <label className="grid gap-2 text-sm font-medium">Nível
              <select className={selectClassName} value={input.level} onChange={(event) => setInput((current) => ({ ...current, level: event.target.value as CreateAcademyStudyInput["level"] }))}>
                {academyLevels.map((value) => <option key={value} value={value}>{academyLabels.levels[value]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">Objetivo
              <select className={selectClassName} value={input.goal} onChange={(event) => setInput((current) => ({ ...current, goal: event.target.value as CreateAcademyStudyInput["goal"] }))}>
                {academyGoals.map((value) => <option key={value} value={value}>{academyLabels.goals[value]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">Duração
              <select className={selectClassName} value={input.duration} onChange={(event) => setInput((current) => ({ ...current, duration: Number(event.target.value) }))}>
                {[15, 30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} minutos</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">Idioma
              <select className={selectClassName} value={input.language} onChange={(event) => setInput((current) => ({ ...current, language: event.target.value as CreateAcademyStudyInput["language"] }))}>
                {academyLanguages.map((value) => <option key={value} value={value}>{academyLabels.languages[value]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">Profundidade
              <select className={selectClassName} value={input.depth} onChange={(event) => setInput((current) => ({ ...current, depth: event.target.value as CreateAcademyStudyInput["depth"] }))}>
                {academyDepths.map((value) => <option key={value} value={value}>{academyLabels.depths[value]}</option>)}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">Estilo
              <select className={selectClassName} value={input.style} onChange={(event) => setInput((current) => ({ ...current, style: event.target.value as CreateAcademyStudyInput["style"] }))}>
                {academyStyles.map((value) => <option key={value} value={value}>{academyLabels.styles[value]}</option>)}
              </select>
            </label>
          </div>
          {formError ? <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{formError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={isCreating || !input.topic.trim() || !input.subject.trim()}>{isCreating ? "Criando..." : "Criar estudo"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
