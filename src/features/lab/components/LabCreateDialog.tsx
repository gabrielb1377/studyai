"use client";

import { useState } from "react";
import { FlaskConical, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { StudyRecord } from "@/types/study-engine";
import { labPracticePresets } from "../services/LabService";
import { labLanguageLabels, labLanguages, type CreateLabProjectInput, type LabDifficulty, type LabLanguage } from "../types";

export function LabCreateDialog({
  studies,
  defaultStudyId,
  onCreate,
}: {
  studies: readonly StudyRecord[];
  defaultStudyId?: string;
  onCreate: (input: CreateLabProjectInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [presetId, setPresetId] = useState("custom");
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<LabLanguage>("javascript");
  const [studyId, setStudyId] = useState(defaultStudyId ?? "");
  const [statement, setStatement] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [difficulty, setDifficulty] = useState<LabDifficulty>("medium");
  const [isCreating, setIsCreating] = useState(false);

  const selectedPreset = labPracticePresets.find((item) => item.id === presetId) ?? labPracticePresets[0];

  const handlePresetChange = (nextId: string) => {
    const previousPreset = selectedPreset;
    const nextPreset = labPracticePresets.find((item) => item.id === nextId) ?? labPracticePresets[0];
    setPresetId(nextPreset.id);
    setLanguage(nextPreset.language);
    setDifficulty(nextPreset.difficulty);
    setStatement(nextPreset.id === "custom" ? "" : nextPreset.statement);
    setExpectedResult(nextPreset.id === "custom" ? "" : nextPreset.expectedResult);
    if (!title.trim() || (previousPreset.defaultTitle && title === previousPreset.defaultTitle)) {
      setTitle(nextPreset.defaultTitle);
    }
  };

  const resetForm = () => {
    setPresetId("custom");
    setTitle("");
    setLanguage("javascript");
    setStudyId(defaultStudyId ?? "");
    setStatement("");
    setExpectedResult("");
    setDifficulty("medium");
  };

  const submit = async () => {
    const study = studies.find((item) => item.studyId === studyId);
    const usePreset = selectedPreset.id !== "custom" && selectedPreset.language === language;
    const hasCustomExercise = usePreset || Boolean(statement.trim() || expectedResult.trim() || difficulty !== "medium");

    setIsCreating(true);
    try {
      await onCreate({
        title,
        language,
        studyId: study?.studyId,
        subject: study?.subject,
        topic: study?.title,
        exercise: hasCustomExercise
          ? {
              statement: statement.trim() || (usePreset ? selectedPreset.statement : undefined),
              expectedResult: expectedResult.trim() || (usePreset ? selectedPreset.expectedResult : ""),
              starterCode: usePreset ? selectedPreset.starterCode : undefined,
              hints: usePreset ? selectedPreset.hints : [],
              solution: usePreset ? selectedPreset.solution : "",
              difficulty,
              steps: usePreset ? selectedPreset.steps.map((step) => ({ ...step, done: false })) : undefined,
            }
          : undefined,
      });
      setOpen(false);
      resetForm();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          Novo exercício
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar exercício de laboratório</DialogTitle>
          <DialogDescription>
            Escolha uma prática guiada ou linguagem para experimentar com segurança no navegador.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="grid gap-2 text-sm font-medium">
            Prática guiada
            <select
              aria-label="Prática guiada"
              value={presetId}
              onChange={(event) => handlePresetChange(event.target.value)}
              className="h-10 rounded-lg border bg-background px-3 text-sm"
            >
              {labPracticePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
            <span className="text-xs font-normal text-muted-foreground">{selectedPreset.description}</span>
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Título
            <Input
              aria-label="Título do exercício"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex.: Consultas SQL básicas"
              maxLength={160}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Linguagem
              <select
                aria-label="Linguagem inicial"
                value={language}
                onChange={(event) => setLanguage(event.target.value as LabLanguage)}
                className="h-10 rounded-lg border bg-background px-3 text-sm"
              >
                {labLanguages.map((item) => (
                  <option key={item} value={item}>
                    {labLanguageLabels[item]}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm font-medium">
              Tema
              <select
                aria-label="Tema relacionado"
                value={studyId}
                onChange={(event) => setStudyId(event.target.value)}
                className="h-10 rounded-lg border bg-background px-3 text-sm"
              >
                <option value="">Estudo livre</option>
                {studies.map((study) => (
                  <option key={study.studyId} value={study.studyId}>
                    {study.subject} · {study.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <details className="rounded-xl border bg-muted/25 p-3 text-sm">
            <summary className="cursor-pointer font-medium">Personalizar enunciado e critério</summary>
            <div className="mt-3 space-y-3">
              <label className="grid gap-1.5 text-xs font-medium">
                Enunciado (aceita Markdown e fórmulas KaTeX)
                <textarea
                  aria-label="Enunciado do exercício"
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Descreva o objetivo ou problema a resolver…"
                  className="w-full rounded-lg border bg-background p-2.5 text-sm font-normal outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-medium">
                  Resultado esperado (opcional)
                  <Input
                    aria-label="Resultado esperado"
                    value={expectedResult}
                    onChange={(event) => setExpectedResult(event.target.value)}
                    placeholder="Ex.: 42 ou Raiz(es)"
                    maxLength={200}
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-medium">
                  Dificuldade
                  <select
                    aria-label="Dificuldade do exercício"
                    value={difficulty}
                    onChange={(event) => setDifficulty(event.target.value as LabDifficulty)}
                    className="h-9 rounded-lg border bg-background px-3 text-sm font-normal"
                  >
                    <option value="easy">Fácil</option>
                    <option value="medium">Médio</option>
                    <option value="hard">Difícil</option>
                  </select>
                </label>
              </div>
            </div>
          </details>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || isCreating}>
            <FlaskConical />
            {isCreating ? "Criando…" : "Criar laboratório"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
