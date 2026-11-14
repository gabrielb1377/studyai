"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import MarkdownRenderer from "@/features/tutor/MarkdownRenderer";
import {
  isLabAIRateLimitError,
  LabAIService,
  type LabChallengeMaterialOption,
} from "../services/LabAIService";
import {
  labChallengeModalities,
  labChallengeModalityLabels,
  labLanguageLabels,
  type CreateLabProjectInput,
  type LabChallengeModality,
  type LabDifficulty,
  type LabGeneratedChallenge,
} from "../types";
import type { StudyRecord } from "@/types/study-engine";

type DialogStatus = "selection" | "generating" | "preview" | "error";

const DIFFICULTY_LABELS: Record<LabDifficulty, string> = {
  easy: "Fácil",
  medium: "Médio",
  hard: "Difícil",
};

export function LabChallengeDialog({
  studies: fallbackStudies,
  defaultStudyId,
  compact = false,
  fullWidth = false,
  onCreate,
}: {
  studies: readonly StudyRecord[];
  defaultStudyId?: string;
  compact?: boolean;
  fullWidth?: boolean;
  onCreate: (input: CreateLabProjectInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [contextStudies, setContextStudies] = useState<StudyRecord[]>([...fallbackStudies]);
  const [materials, setMaterials] = useState<LabChallengeMaterialOption[]>([]);
  const [selectedStudyId, setSelectedStudyId] = useState(defaultStudyId ?? "");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [modality, setModality] = useState<LabChallengeModality>("code");
  const [difficulty, setDifficulty] = useState<LabDifficulty>("medium");
  const [status, setStatus] = useState<DialogStatus>("selection");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [preview, setPreview] = useState<{
    challenge: LabGeneratedChallenge;
    material: LabChallengeMaterialOption;
    studyId?: string;
  } | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);

  const generatingLockRef = useRef(false);
  const acceptingLockRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const selectedStudyIdRef = useRef(selectedStudyId);
  selectedStudyIdRef.current = selectedStudyId;

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((current) => Math.max(0, current - 1)), 1_000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setIsLoadingContext(true);
    void LabAIService.listChallengeContext()
      .then((context) => {
        if (!active) return;
        setContextStudies(context.studies.length ? context.studies : [...fallbackStudies]);
        setMaterials(context.materials);

        const previousStudyId = selectedStudyIdRef.current;
        const initialStudyId =
          defaultStudyId && context.studies.some((study) => study.studyId === defaultStudyId)
            ? defaultStudyId
            : previousStudyId && context.studies.some((study) => study.studyId === previousStudyId)
              ? previousStudyId
              : "";
        setSelectedStudyId(initialStudyId);

        const pool = initialStudyId
          ? context.materials.filter((item) => item.studyId === initialStudyId)
          : context.materials;
        const preferred = pool.find((item) => item.hasUsableText) ?? pool[0] ?? context.materials[0];
        setSelectedMaterialId((current) =>
          current && pool.some((item) => item.id === current) ? current : preferred?.id ?? "",
        );
      })
      .catch(() => {
        if (!active) return;
        setErrorMessage("Não foi possível carregar seus estudos e materiais.");
        setStatus("error");
      })
      .finally(() => {
        if (active) setIsLoadingContext(false);
      });

    return () => {
      active = false;
    };
  }, [open, defaultStudyId, fallbackStudies]);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  const filteredMaterials = useMemo(() => {
    if (!selectedStudyId) return materials;
    return materials.filter((item) => item.studyId === selectedStudyId);
  }, [materials, selectedStudyId]);

  const selectedMaterial = useMemo(
    () =>
      filteredMaterials.find((item) => item.id === selectedMaterialId) ??
      filteredMaterials[0] ??
      undefined,
    [filteredMaterials, selectedMaterialId],
  );

  const handleStudyChange = (nextStudyId: string) => {
    setSelectedStudyId(nextStudyId);
    const pool = nextStudyId
      ? materials.filter((item) => item.studyId === nextStudyId)
      : materials;
    const preferred = pool.find((item) => item.hasUsableText) ?? pool[0];
    setSelectedMaterialId(preferred?.id ?? "");
    if (status === "error") {
      setStatus("selection");
      setErrorMessage(undefined);
    }
  };

  const handleMaterialChange = (nextMaterialId: string) => {
    setSelectedMaterialId(nextMaterialId);
    if (status === "error") {
      setStatus("selection");
      setErrorMessage(undefined);
    }
  };

  const resetDialogState = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    generatingLockRef.current = false;
    acceptingLockRef.current = false;
    setPreview(null);
    setStatus("selection");
    setErrorMessage(undefined);
    setIsAccepting(false);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDialogState();
    }
  };

  const runGeneration = async () => {
    if (generatingLockRef.current || status === "generating" || cooldownSeconds > 0) return;

    if (!selectedMaterial) {
      setErrorMessage("Selecione um estudo com material importado para gerar o desafio.");
      setStatus("error");
      return;
    }

    if (!selectedMaterial.hasUsableText) {
      setErrorMessage(
        selectedMaterial.emptyReason ??
          "Este material não possui texto extraído suficiente para gerar um desafio.",
      );
      setStatus("error");
      return;
    }

    generatingLockRef.current = true;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus("generating");
    setErrorMessage(undefined);
    setPreview(null);

    try {
      const challenge = await LabAIService.generateChallenge(
        {
          studyId: selectedStudyId || selectedMaterial.studyId,
          material: selectedMaterial,
          modality,
          difficulty,
        },
        { signal: controller.signal },
      );

      if (controller.signal.aborted) return;

      setPreview({
        challenge,
        material: selectedMaterial,
        studyId: selectedStudyId || selectedMaterial.studyId,
      });
      setStatus("preview");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (isLabAIRateLimitError(error)) {
        setCooldownSeconds(Math.max(1, Math.ceil(error.retryAfterMs / 1_000)));
      }
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível gerar o desafio prático com IA.",
      );
      setStatus("error");
    } finally {
      generatingLockRef.current = false;
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleAccept = async () => {
    if (!preview || acceptingLockRef.current || isAccepting) return;
    acceptingLockRef.current = true;
    setIsAccepting(true);

    try {
      const linkedStudy = contextStudies.find(
        (study) => study.studyId === (preview.studyId ?? preview.material.studyId),
      );
      const { challenge, material } = preview;

      await onCreate({
        title: challenge.title,
        language: challenge.language,
        studyId: preview.studyId ?? material.studyId,
        sourceMaterialId: material.id,
        sourceMaterialName: material.name,
        generatedByAI: true,
        subject: material.subject ?? linkedStudy?.subject,
        topic: material.topic ?? linkedStudy?.title,
        exercise: {
          statement: challenge.statement,
          language: challenge.language,
          starterCode: challenge.starterCode,
          expectedResult: challenge.expectedResult,
          hints: challenge.hints,
          solution: challenge.solution,
          difficulty: challenge.difficulty,
          steps: challenge.steps,
        },
      });

      setOpen(false);
      resetDialogState();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível salvar o desafio gerado.",
      );
      setStatus("error");
    } finally {
      acceptingLockRef.current = false;
      setIsAccepting(false);
    }
  };

  const canSubmitSelection =
    !isLoadingContext &&
    status !== "generating" &&
    cooldownSeconds === 0 &&
    Boolean(selectedMaterial?.hasUsableText);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size={compact ? "sm" : "default"} variant="outline" className={fullWidth ? "w-full" : undefined}>
          <Sparkles />
          Gerar desafio com IA
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Gerar desafio prático com IA</DialogTitle>
          <DialogDescription>
            Escolha um estudo e um material com conteúdo extraído para criar um desafio sob medida no Laboratório.
          </DialogDescription>
        </DialogHeader>

        {status === "preview" && preview ? (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{labChallengeModalityLabels[preview.challenge.modality]}</Badge>
                <Badge variant="outline">{labLanguageLabels[preview.challenge.language]}</Badge>
                <Badge variant="outline">{DIFFICULTY_LABELS[preview.challenge.difficulty]}</Badge>
                <Badge variant="secondary" className="max-w-full truncate">
                  <FileText className="mr-1 size-3 shrink-0" />
                  {preview.material.name}
                </Badge>
              </div>

              <h3 className="mt-3 text-base font-semibold break-words">{preview.challenge.title}</h3>

              <div className="mt-2 text-sm leading-6 break-words">
                <MarkdownRenderer content={preview.challenge.statement} />
              </div>

              <div className="mt-3 rounded-lg bg-secondary/60 p-3 text-xs leading-5">
                <strong>Resultado esperado</strong>
                <p className="mt-1 text-muted-foreground break-words">{preview.challenge.expectedResult}</p>
              </div>

              {preview.challenge.steps.length ? (
                <div className="mt-3 rounded-lg border bg-background/60 p-3 text-xs">
                  <strong>Passos guiados ({preview.challenge.steps.length})</strong>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-muted-foreground">
                    {preview.challenge.steps.map((step) => (
                      <li key={step.id} className="break-words">
                        {step.title}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Código inicial sugerido</p>
                <pre className="max-h-48 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs leading-5">
                  <code>{preview.challenge.starterCode}</code>
                </pre>
              </div>

              {preview.challenge.explanation ? (
                <p className="mt-3 text-xs leading-5 text-muted-foreground break-words">
                  <strong>Abordagem:</strong> {preview.challenge.explanation}
                </p>
              ) : null}
            </div>

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isAccepting}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null);
                  setStatus("selection");
                }}
                disabled={isAccepting}
              >
                Ajustar parâmetros
              </Button>
              <Button onClick={() => void handleAccept()} disabled={isAccepting}>
                {isAccepting ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
                {isAccepting ? "Abrindo…" : "Aceitar e abrir no Laboratório"}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            {isLoadingContext ? (
              <div className="flex items-center gap-2 rounded-xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Carregando estudos e materiais disponíveis…
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium min-w-0">
                Estudo
                <select
                  aria-label="Estudo para o desafio"
                  value={selectedStudyId}
                  onChange={(event) => handleStudyChange(event.target.value)}
                  disabled={status === "generating"}
                  className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="">Todos os estudos</option>
                  {contextStudies.map((study) => (
                    <option key={study.studyId} value={study.studyId}>
                      {study.subject} · {study.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium min-w-0">
                Material de origem
                <select
                  aria-label="Material para o desafio"
                  value={selectedMaterial?.id ?? ""}
                  onChange={(event) => handleMaterialChange(event.target.value)}
                  disabled={status === "generating" || !filteredMaterials.length}
                  className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
                >
                  {filteredMaterials.length ? (
                    filteredMaterials.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} {item.hasUsableText ? "" : "(sem texto extraído)"}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhum material vinculado</option>
                  )}
                </select>
              </label>
            </div>

            {!isLoadingContext && !filteredMaterials.length ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>
                  {selectedStudyId
                    ? "Este estudo ainda não possui materiais importados com texto extraído. Selecione outro estudo ou importe um material primeiro."
                    : "Nenhum material de estudo disponível. Importe ou publique um material na Biblioteca para gerar desafios com IA."}
                </p>
              </div>
            ) : null}

            {!isLoadingContext && selectedMaterial && !selectedMaterial.hasUsableText ? (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-amber-800 dark:text-amber-300"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <p>{selectedMaterial.emptyReason}</p>
              </div>
            ) : null}

            {!isLoadingContext && selectedMaterial?.hasUsableText ? (
              <div className="rounded-xl border bg-muted/25 p-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  <FileText className="size-3.5 text-primary" />
                  <span className="truncate">{selectedMaterial.name}</span>
                </div>
                <p className="mt-1 line-clamp-2 break-words">
                  {selectedMaterial.extractedText}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-medium min-w-0">
                Modalidade
                <select
                  aria-label="Modalidade do desafio"
                  value={modality}
                  onChange={(event) => setModality(event.target.value as LabChallengeModality)}
                  disabled={status === "generating"}
                  className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
                >
                  {labChallengeModalities.map((item) => (
                    <option key={item} value={item}>
                      {labChallengeModalityLabels[item]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-medium min-w-0">
                Dificuldade
                <select
                  aria-label="Dificuldade do desafio"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value as LabDifficulty)}
                  disabled={status === "generating"}
                  className="h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm"
                >
                  <option value="easy">Fácil</option>
                  <option value="medium">Médio</option>
                  <option value="hard">Difícil</option>
                </select>
              </label>
            </div>

            {status === "error" && errorMessage ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-xs leading-5 text-destructive"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <p className="min-w-0 flex-1 break-words">{errorMessage}</p>
                </div>
                {cooldownSeconds > 0 ? (
                  <p aria-live="polite" className="text-muted-foreground">
                    Nova tentativa disponível em {cooldownSeconds}s.
                  </p>
                ) : null}
              </div>
            ) : null}

            <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void runGeneration()}
                disabled={!canSubmitSelection}
              >
                {status === "generating" ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Gerando desafio…
                  </>
                ) : status === "error" ? (
                  <>
                    <RotateCcw />
                    Tentar novamente
                  </>
                ) : (
                  <>
                    <Sparkles />
                    Gerar desafio
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
