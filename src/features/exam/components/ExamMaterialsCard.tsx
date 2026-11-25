"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Feedback } from "@/components/ui/feedback";
import { Skeleton } from "@/components/ui/skeleton";
import { materialKind } from "@/features/tutor/services/DisciplineContext";
import { ExamMaterialPractice, type PracticeAssessment } from "../ExamMaterialPractice";
import { ExamMaterialSimulation } from "../ExamMaterialSimulation";
import type { Exam, MaterialExamAttempt, MaterialExamQuestion } from "@/types/exam";
import type { Material } from "@/types/material";
import type { StudyRecord } from "@/types/study-engine";

export function ExamMaterialsCard({
  selectedExam,
  linkedMaterials,
  availableMaterials,
  studies,
  eligibleStudies,
  linkedStudyIds,
  preparationKey,
  catalog,
  catalogError,
  materialsLoading,
  materialsError,
  materialNotice,
  activePractice,
  onSetPracticeMaterial,
  onRemoveMaterial,
  onAddMaterial,
  onLinkStudy,
  onSaveMaterialAttempt,
  onRecordPractice,
  onReviewMaterialsWithTutor,
}: {
  selectedExam: Exam;
  linkedMaterials: readonly Material[];
  availableMaterials: readonly Material[];
  studies: readonly StudyRecord[];
  eligibleStudies: readonly StudyRecord[];
  linkedStudyIds: ReadonlySet<string | undefined>;
  preparationKey?: string;
  catalog: MaterialExamQuestion[];
  catalogError: boolean;
  materialsLoading: boolean;
  materialsError: boolean;
  materialNotice?: string;
  activePractice?: Material;
  onSetPracticeMaterial: (material?: { examId: string; materialId: string }) => void;
  onRemoveMaterial: (id: string) => void;
  onAddMaterial: (id: string) => void;
  onLinkStudy: (id?: string) => void;
  onSaveMaterialAttempt: (attempt: MaterialExamAttempt) => void;
  onRecordPractice: (assessment: PracticeAssessment) => void;
  onReviewMaterialsWithTutor: () => void;
}) {
  return (
    <Card className="p-6 space-y-4 shadow-none">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2">
          <FileText className="size-5 text-primary" /> Materiais Vinculados
        </h3>
        <Badge variant="outline">{linkedMaterials.length}</Badge>
      </div>

      {selectedExam.practiceTotals && (
        <p className="text-sm">
          Autoavaliação dos materiais: {selectedExam.practiceTotals.correct} acertos,{" "}
          {selectedExam.practiceTotals.wrong} erros, {selectedExam.practiceTotals.reviewed} sem correção.
        </p>
      )}

      {selectedExam.disciplineKey && (
        <div className="flex flex-wrap gap-3">
          <Link className="underline" href={`/estudo/revisao?disciplina=${encodeURIComponent(selectedExam.disciplineKey)}`}>
            Revisar meus pontos fracos
          </Link>
          {linkedMaterials.length > 0 && (
            <Button type="button" variant="outline" onClick={onReviewMaterialsWithTutor}>
              Revisar materiais com Tutor
            </Button>
          )}
        </div>
      )}

      {materialNotice ? (
        <Feedback variant="warning" role="status">{materialNotice}</Feedback>
      ) : null}

      {materialsLoading ? (
        <div role="status" aria-label="Carregando materiais vinculados" className="py-4 space-y-2">
          <span className="sr-only">Carregando materiais vinculados...</span>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : materialsError ? (
        <p role="status" className="text-sm text-muted-foreground text-center py-4">
          A Biblioteca está temporariamente indisponível. Os vínculos existentes foram preservados.
        </p>
      ) : linkedMaterials.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          Nenhum material vinculado. Selecione materiais da biblioteca abaixo para associar a esta prova.
        </p>
      ) : null}

      {linkedMaterials.length > 0 && !materialsLoading && !materialsError ? (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {linkedMaterials.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-1 rounded-xl border bg-card/40 p-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  {m.studyId ? (
                    <Link
                      className="block truncate text-sm font-medium underline"
                      href={`/estudo?tema=${encodeURIComponent(m.studyId)}&arquivo=${encodeURIComponent(m.id)}&aba=material`}
                    >
                      {m.name}
                    </Link>
                  ) : (
                    <p className="truncate text-sm font-medium">{m.name}</p>
                  )}
                  <p className="truncate text-xs text-muted-foreground">
                    {m.subject ?? m.topic ?? "Sem assunto definido"} · {materialKind(m)}
                  </p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSetPracticeMaterial({ examId: selectedExam.id, materialId: m.id })}
              >
                Praticar
              </Button>
              <Button
                type="button"
                aria-label={`Remover material ${m.name}`}
                variant="ghost"
                size="sm"
                onClick={() => onRemoveMaterial(m.id)}
              >
                Remover
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      {activePractice && (
        <ExamMaterialPractice
          key={`${selectedExam.id}:${activePractice.id}`}
          materialId={activePractice.id}
          onAssess={onRecordPractice}
        />
      )}

      {preparationKey && (
        <div className="border-t pt-4">
          {catalogError && <p role="alert">Não foi possível carregar as questões extraídas.</p>}
          <ExamMaterialSimulation
            key={JSON.stringify([selectedExam.id, preparationKey])}
            exam={selectedExam}
            catalog={catalog}
            save={onSaveMaterialAttempt}
          />
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="exam-linked-study" className="text-xs font-semibold text-muted-foreground uppercase">
          Vincular Estudo
        </label>
        <select
          id="exam-linked-study"
          className="rounded-md border bg-background px-3 py-2 text-sm mt-1 w-full"
          value={selectedExam.studyId ?? ""}
          onChange={(e) => {
            const id = e.target.value;
            onLinkStudy(id || undefined);
          }}
        >
          <option value="">Nenhum estudo vinculado</option>
          {selectedExam.studyId && !studies.some((study) => study.studyId === selectedExam.studyId) ? (
            <option value={selectedExam.studyId}>Estudo indisponível (vínculo preservado)</option>
          ) : null}
          {eligibleStudies
            .filter((study) => !selectedExam.disciplineKey || linkedStudyIds.has(study.studyId))
            .map((s) => (
              <option key={s.studyId} value={s.studyId}>
                {s.title} ({s.subject})
              </option>
            ))}
        </select>

        <p className="text-xs font-semibold text-muted-foreground uppercase">Adicionar Material da Biblioteca</p>
        {!materialsLoading && !materialsError && availableMaterials.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-3">
            Nenhum material disponível para vincular. Importe ou organize materiais na Biblioteca primeiro.
          </p>
        ) : null}

        {availableMaterials.length > 0 && !materialsLoading && !materialsError ? (
          <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
            {availableMaterials.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-label={`Adicionar material ${m.name}`}
                className="flex w-full items-center justify-between rounded-xl border bg-card/40 p-3 text-left transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onAddMaterial(m.id)}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <FileText className="size-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.subject ?? m.topic ?? "Sem assunto definido"} · {m.fileType.toUpperCase()}
                      {m.studyId ? " · vinculado a estudo" : ""}
                    </p>
                  </div>
                </div>
                <span className="ml-3 shrink-0 text-xs text-primary">Adicionar</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
