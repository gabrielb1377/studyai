"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useExtraction } from "@/features/extraction/useExtraction";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useMaterials } from "@/hooks/useMaterials";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { StudyMaterial, StudyMaterialType } from "@/types/study";
import { StudyHeader } from "./StudyHeader";
import { StudyNavigationSidebar } from "./StudyNavigationSidebar";
import { useStudyEngine } from "./hooks/useStudyEngine";
import { WorkspacePersistence, type StudyWorkspaceState } from "./services/WorkspacePersistence";
import { WorkspaceCanvas } from "@/features/workspace/components/WorkspaceCanvas";

function toStudyMaterialType(fileType: string): StudyMaterialType {
  if (fileType === "pdf") return "pdf";
  if (fileType === "mp4") return "video";
  if (fileType === "mp3" || fileType === "wav" || fileType === "m4a") return "audio";
  if (fileType === "png" || fileType === "jpg" || fileType === "jpeg" || fileType === "webp") return "image";
  if (fileType === "txt") return "text";
  return "document";
}

export function StudyWorkspace({ requestedStudyId, requestedMaterialId, requestedTab, requestedLayoutId, requestedQuizMode, resetWorkspace = false, returnHref }: { requestedStudyId?: string; requestedMaterialId?: string; requestedTab?: string; requestedLayoutId?: string; requestedQuizMode?: "exam"; resetWorkspace?: boolean; returnHref?: string }) {
  const { records, isLoading, recordAccess, setProgress, setStatus } = useStudyEngine();
  const { materials } = useMaterials();
  const { records: extractedContents } = useExtraction();
  const record = requestedStudyId
    ? records.find((item) => item.studyId === requestedStudyId)
    : [...records].sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
  const studyId = record?.studyId;
  const { cards: flashcards } = useFlashcards(studyId);
  const { results: quizzes } = useQuiz(studyId);
  const [workspace, setWorkspace] = useState<StudyWorkspaceState | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [sidebarInFocus, setSidebarInFocus] = useState(false);

  const studyMaterials = useMemo<StudyMaterial[]>(() => {
    if (!studyId) return [];
    return materials.filter((material) => material.studyId === studyId).map((material) => {
      const extracted = extractedContents.find((content) => content.fileId === material.fileId);
      return {
        id: material.id,
        name: material.name,
        type: toStudyMaterialType(material.fileType),
        mimeType: material.mimeType,
        fileType: material.fileType,
        size: material.size,
        source: MaterialRuntimeStore.get(material.id)?.source,
        textContent: extracted?.extractedText,
        duration: extracted?.metadata.duration,
        transcriptionPerformed: extracted?.metadata.transcriptionPerformed,
        transcriptionSource: extracted?.metadata.transcriptionSource,
        transcriptionSegments: extracted?.transcription?.segments,
        chapters: extracted?.metadata.chapters,
        persistentBinary: material.persistentBinary,
        binaryStorageId: material.binaryStorageId,
        lastModified: material.lastModified,
      };
    });
  }, [extractedContents, materials, studyId]);

  useEffect(() => {
    if (studyId) recordAccess(studyId);
  }, [recordAccess, studyId]);

  useEffect(() => {
    if (!studyId) return;
    const stored = WorkspacePersistence.load(studyId);
    const next = {
      ...stored,
      materialId: requestedMaterialId ?? stored.materialId,
      quiz: requestedTab === "quiz" && requestedQuizMode
        ? { ...stored.quiz, mode: requestedQuizMode }
        : stored.quiz,
    };
    setWorkspace(next);
    WorkspacePersistence.save(studyId, next);
  }, [requestedMaterialId, requestedQuizMode, requestedTab, studyId]);

  const updateWorkspace = (changes: Partial<StudyWorkspaceState>) => {
    if (!studyId) return;
    setWorkspace(WorkspacePersistence.save(studyId, changes));
  };

  if (isLoading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground shadow-none">Carregando estudo...</Card>;
  }

  if (!record) {
    const invalidRequestedStudy = Boolean(requestedStudyId);
    return (
      <section className="flex max-w-xl flex-col items-start gap-4 py-4">
        <BookOpen className="size-9 text-muted-foreground" aria-hidden="true" />
        <h1 className="type-page-title">{invalidRequestedStudy ? "Estudo indisponível" : "Nenhum estudo disponível"}</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {invalidRequestedStudy
            ? "O estudo solicitado não está disponível nesta conta. O endereço informado não concede acesso a estudos de outra sessão."
            : "Importe e organize um material para criar automaticamente um estudo."}
        </p>
        <Button asChild><Link href={returnHref ?? (invalidRequestedStudy ? "/estudo" : "/importar")}>{returnHref === "/biblioteca" ? "Voltar à Biblioteca" : returnHref ? "Voltar à Semana de Prova" : invalidRequestedStudy ? "Ver estudos disponíveis" : "Importar material"}</Link></Button>
      </section>
    );
  }

  const activeMaterialId = workspace?.materialId && studyMaterials.some((material) => material.id === workspace.materialId)
    ? workspace.materialId
    : studyMaterials[0]?.id;
  const activeMaterial = studyMaterials.find((material) => material.id === activeMaterialId);
  const showSidebar = !focusMode || sidebarInFocus;
  return (
    <>
      <StudyHeader
        study={record}
        fileName={activeMaterial?.name}
        returnHref={returnHref}
        focusMode={focusMode}
        sidebarVisible={sidebarInFocus}
        onToggleSidebar={() => setSidebarInFocus((current) => !current)}
      />
      <div className={`grid items-start gap-5 ${showSidebar ? "lg:grid-cols-[16rem_minmax(0,1fr)]" : "grid-cols-1"}`}>
        {showSidebar ? (
          <StudyNavigationSidebar
            studies={records}
            materials={materials}
            activeStudyId={record.studyId}
            activeMaterialId={activeMaterialId}
            returnHref={returnHref}
          />
        ) : null}
        <main className="min-w-0">
          <WorkspaceCanvas
            study={record}
            materials={studyMaterials}
            requestedMaterialId={requestedMaterialId ?? activeMaterialId}
            requestedTab={requestedTab}
            requestedLayoutId={requestedLayoutId}
            resetWorkspace={resetWorkspace}
            flashcards={flashcards}
            quizzes={quizzes}
            onMaterialChange={(materialId) => updateWorkspace({ materialId })}
            onProgressChange={(progress) => setProgress(record.studyId, progress)}
            onStatusChange={(status) => setStatus(record.studyId, status)}
            onFocusModeChange={(active) => {
              setFocusMode(active);
              if (!active) setSidebarInFocus(false);
            }}
          />
        </main>
      </div>
    </>
  );
}
