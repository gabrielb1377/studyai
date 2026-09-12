"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { BookOpen, Bot, GraduationCap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useExtraction } from "@/features/extraction/useExtraction";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { TutorWorkspace } from "@/features/tutor/TutorWorkspace";
import { useMaterials } from "@/hooks/useMaterials";
import { MaterialRuntimeStore } from "@/services/material-runtime-store";
import type { StudyMaterial, StudyMaterialType } from "@/types/study";
import { MaterialTab } from "./MaterialTab";
import { StudyHeader } from "./StudyHeader";
import { StudyStatistics } from "./StudyStatistics";
import { StudyToolsTab } from "./StudyToolsTab";
import { useStudyEngine } from "./hooks/useStudyEngine";

function toStudyMaterialType(fileType: string): StudyMaterialType {
  if (fileType === "pdf") return "pdf";
  if (fileType === "mp4") return "video";
  if (fileType === "mp3" || fileType === "wav" || fileType === "m4a") return "audio";
  if (fileType === "png" || fileType === "jpg" || fileType === "jpeg" || fileType === "webp") return "image";
  if (fileType === "txt") return "text";
  return "document";
}

export function StudyWorkspace({ requestedStudyId }: { requestedStudyId?: string }) {
  const { records, isLoading, recordAccess, setProgress, setStatus } = useStudyEngine();
  const { materials } = useMaterials();
  const { records: extractedContents } = useExtraction();
  const record = requestedStudyId
    ? records.find((item) => item.studyId === requestedStudyId)
    : [...records].sort((a, b) => b.lastAccessedAt.localeCompare(a.lastAccessedAt))[0];
  const studyId = record?.studyId;
  const { cards: flashcards } = useFlashcards(studyId);
  const { results: quizzes } = useQuiz(studyId);

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
      };
    });
  }, [extractedContents, materials, studyId]);

  useEffect(() => {
    if (studyId) recordAccess(studyId);
  }, [recordAccess, studyId]);

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

  return (
    <>
      <StudyHeader study={record} />
      <Tabs defaultValue="material" className="gap-6">
        <TabsList aria-label="Áreas de estudo" className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="material" className="min-w-28"><BookOpen aria-hidden="true" />Material</TabsTrigger>
          <TabsTrigger value="ia" className="min-w-24"><Bot aria-hidden="true" />IA</TabsTrigger>
          <TabsTrigger value="study" className="min-w-28"><GraduationCap aria-hidden="true" />Estudar</TabsTrigger>
        </TabsList>
        <TabsContent value="material" forceMount className="data-[state=inactive]:hidden"><MaterialTab materials={studyMaterials} /></TabsContent>
        <TabsContent value="ia" forceMount className="data-[state=inactive]:hidden"><TutorWorkspace /></TabsContent>
        <TabsContent value="study" forceMount className="data-[state=inactive]:hidden"><StudyToolsTab study={record} /></TabsContent>
        <StudyStatistics record={record} flashcardCount={flashcards.length} quizCount={quizzes.length} onProgressChange={(progress) => setProgress(record.studyId, progress)} onStatusChange={(status) => setStatus(record.studyId, status)} />
      </Tabs>
    </>
  );
}
