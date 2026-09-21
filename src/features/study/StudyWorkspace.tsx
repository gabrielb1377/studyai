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

export function StudyWorkspace({ requestedStudyId, requestedMaterialId, requestedTab }: { requestedStudyId?: string; requestedMaterialId?: string; requestedTab?: string }) {
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

  const studyMaterials = useMemo<StudyMaterial[]>(() => {
    if (!studyId) return [];
    return materials.filter((material) => material.studyId === studyId).map((material) => {
      const extracted = extractedContents.find((content) => content.fileId === material.fileId);
      return {
        id: material.id,
        name: material.name,
        type: toStudyMaterialType(material.fileType),
        mimeType: material.mimeType,
        size: material.size,
        source: MaterialRuntimeStore.get(material.id)?.source,
        textContent: extracted?.extractedText,
        chapters: extracted?.metadata.chapters,
        persistentBinary: material.persistentBinary,
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
    const next = { ...stored, materialId: requestedMaterialId ?? stored.materialId };
    setWorkspace(next);
    WorkspacePersistence.save(studyId, next);
  }, [requestedMaterialId, requestedTab, studyId]);

  const updateWorkspace = (changes: Partial<StudyWorkspaceState>) => {
    if (!studyId) return;
    setWorkspace(WorkspacePersistence.save(studyId, changes));
  };

  if (isLoading) {
    return <Card className="p-10 text-center text-sm text-muted-foreground shadow-none">Carregando estudo...</Card>;
  }

  if (!record) {
    return (
      <Card className="items-center gap-4 p-10 text-center shadow-none">
        <BookOpen className="size-9 text-muted-foreground" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Nenhum estudo disponível</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Importe e organize um material para criar automaticamente um estudo.
        </p>
        <Button asChild><Link href="/importar">Importar material</Link></Button>
      </Card>
    );
  }

  const activeMaterialId = workspace?.materialId && studyMaterials.some((material) => material.id === workspace.materialId)
    ? workspace.materialId
    : studyMaterials[0]?.id;
  const activeMaterial = studyMaterials.find((material) => material.id === activeMaterialId);
  return (
    <>
      <StudyHeader study={record} fileName={activeMaterial?.name} />
      <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <StudyNavigationSidebar studies={records} materials={materials} activeStudyId={record.studyId} activeMaterialId={activeMaterialId} />
        <main className="min-w-0">
          <WorkspaceCanvas
            study={record}
            materials={studyMaterials}
            requestedMaterialId={requestedMaterialId ?? activeMaterialId}
            requestedTab={requestedTab}
            flashcards={flashcards}
            quizzes={quizzes}
            onMaterialChange={(materialId) => updateWorkspace({ materialId })}
            onProgressChange={(progress) => setProgress(record.studyId, progress)}
            onStatusChange={(status) => setStatus(record.studyId, status)}
          />
        </main>
      </div>
    </>
  );
}
