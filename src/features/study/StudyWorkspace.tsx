"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Bot, BrainCircuit, ClipboardCheck, Network, NotebookPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExtraction } from "@/features/extraction/useExtraction";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useMaterials } from "@/hooks/useMaterials";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { StudyMaterial, StudyMaterialType } from "@/types/study";
import { MaterialTab } from "./MaterialTab";
import { StudyHeader } from "./StudyHeader";
import { StudyStatistics } from "./StudyStatistics";
import { StudyNavigationSidebar } from "./StudyNavigationSidebar";
import { useStudyEngine } from "./hooks/useStudyEngine";
import { WorkspacePersistence, workspaceTabs, type StudyWorkspaceState, type WorkspaceTab } from "./services/WorkspacePersistence";
import { useLearningSession } from "@/features/learning/hooks/useLearningSession";

const lazyState = <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Carregando área de estudo…</p>;
const TutorWorkspace = dynamic(() => import("@/features/tutor/TutorWorkspace").then((module) => module.TutorWorkspace), { loading: () => lazyState });
const SummaryList = dynamic(() => import("@/features/summaries/SummaryList").then((module) => module.SummaryList), { loading: () => lazyState });
const FlashcardWorkspace = dynamic(() => import("@/features/flashcards/FlashcardWorkspace").then((module) => module.FlashcardWorkspace), { loading: () => lazyState });
const QuizWorkspace = dynamic(() => import("@/features/quiz/QuizWorkspace").then((module) => module.QuizWorkspace), { loading: () => lazyState });
const NotesWorkspace = dynamic(() => import("@/features/notes/NotesWorkspace").then((module) => module.NotesWorkspace), { loading: () => lazyState });
const KnowledgeMapView = dynamic(() => import("@/features/semantic/KnowledgeMapView").then((module) => module.KnowledgeMapView), { loading: () => lazyState });

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
  useLearningSession(studyId);

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
    const activeTab = workspaceTabs.includes(requestedTab as WorkspaceTab)
      ? requestedTab as WorkspaceTab
      : stored.activeTab;
    const next = { ...stored, activeTab, materialId: requestedMaterialId ?? stored.materialId };
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
  const activeTab = workspace?.activeTab ?? "material";

  return (
    <>
      <StudyHeader study={record} fileName={activeMaterial?.name} />
      <div className="grid items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <StudyNavigationSidebar studies={records} materials={materials} activeStudyId={record.studyId} activeMaterialId={activeMaterialId} />
        <div className="min-w-0 space-y-7">
          <Tabs value={activeTab} onValueChange={(value) => updateWorkspace({ activeTab: value as WorkspaceTab })} className="gap-6">
            <TabsList aria-label="Áreas de estudo" className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="material" className="min-w-28"><BookOpen />Material</TabsTrigger>
              <TabsTrigger value="ia" className="min-w-20"><Bot />IA</TabsTrigger>
              <TabsTrigger value="knowledge" className="min-w-44"><Network />Mapa de Conhecimento</TabsTrigger>
              <TabsTrigger value="flashcards" className="min-w-28"><BrainCircuit />Flashcards</TabsTrigger>
              <TabsTrigger value="quiz" className="min-w-20"><ClipboardCheck />Quiz</TabsTrigger>
              <TabsTrigger value="notes" className="min-w-24"><NotebookPen />Notas</TabsTrigger>
            </TabsList>
            <TabsContent value="material"><MaterialTab studyId={record.studyId} materials={studyMaterials} selectedMaterialId={activeMaterialId} onMaterialChange={(materialId) => updateWorkspace({ materialId })} /></TabsContent>
            <TabsContent value="ia" className="space-y-5"><TutorWorkspace /><SummaryList studyId={record.studyId} /></TabsContent>
            <TabsContent value="knowledge"><KnowledgeMapView studyId={record.studyId} /></TabsContent>
            <TabsContent value="flashcards"><FlashcardWorkspace study={record} /></TabsContent>
            <TabsContent value="quiz"><QuizWorkspace study={record} /></TabsContent>
            <TabsContent value="notes"><NotesWorkspace study={record} /></TabsContent>
          </Tabs>
          <StudyStatistics record={record} flashcards={flashcards} quizzes={quizzes} onProgressChange={(progress) => setProgress(record.studyId, progress)} onStatusChange={(status) => setStatus(record.studyId, status)} />
        </div>
      </div>
    </>
  );
}
