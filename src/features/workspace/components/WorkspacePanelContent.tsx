"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import type { Flashcard } from "@/types/flashcard";
import type { QuizResult } from "@/types/quiz";
import type { StudyMaterial } from "@/types/study";
import type { StudyRecord, StudyStatus } from "@/types/study-engine";
import type { WorkspacePanel } from "../types";
import { MaterialTab } from "@/features/study/MaterialTab";
import { StudyStatistics } from "@/features/study/StudyStatistics";

const loading = () => <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Carregando ferramenta…</p>;
const TutorWorkspace = dynamic(() => import("@/features/tutor/TutorWorkspace").then((module) => module.TutorWorkspace), { loading });
const MentorWorkspace = dynamic(() => import("@/features/mentor/components/MentorWorkspace").then((module) => module.MentorWorkspace), { loading });
const SummaryList = dynamic(() => import("@/features/summaries/SummaryList").then((module) => module.SummaryList), { loading });
const FlashcardWorkspace = dynamic(() => import("@/features/flashcards/FlashcardWorkspace").then((module) => module.FlashcardWorkspace), { loading });
const QuizWorkspace = dynamic(() => import("@/features/quiz/QuizWorkspace").then((module) => module.QuizWorkspace), { loading });
const NotesWorkspace = dynamic(() => import("@/features/notes/NotesWorkspace").then((module) => module.NotesWorkspace), { loading });
const KnowledgeMapView = dynamic(() => import("@/features/semantic/KnowledgeMapView").then((module) => module.KnowledgeMapView), { loading });

export const WorkspacePanelContent = memo(function WorkspacePanelContent({ panel, study, materials, flashcards, quizzes, onMaterialChange, onProgressChange, onStatusChange }: {
  panel: WorkspacePanel;
  study: StudyRecord;
  materials: readonly StudyMaterial[];
  flashcards: readonly Flashcard[];
  quizzes: readonly QuizResult[];
  onMaterialChange: (materialId: string) => void;
  onProgressChange: (progress: number) => void;
  onStatusChange: (status: StudyStatus) => void;
}) {
  if (panel.type === "material") return <MaterialTab studyId={study.studyId} materials={materials} selectedMaterialId={panel.resourceId ?? materials[0]?.id} onMaterialChange={onMaterialChange} compact />;
  if (panel.type === "tutor") return <div className="space-y-5"><TutorWorkspace compact instanceId={panel.id} /><SummaryList studyId={study.studyId} /></div>;
  if (panel.type === "mentor") return <MentorWorkspace study={study} />;
  if (panel.type === "summaries") return <SummaryList studyId={study.studyId} />;
  if (panel.type === "flashcards") return <FlashcardWorkspace study={study} />;
  if (panel.type === "quiz") return <QuizWorkspace study={study} />;
  if (panel.type === "notes") return <NotesWorkspace study={study} panelId={panel.id} />;
  if (panel.type === "knowledge") return <KnowledgeMapView studyId={study.studyId} />;
  return <StudyStatistics record={study} flashcards={flashcards} quizzes={quizzes} onProgressChange={onProgressChange} onStatusChange={onStatusChange} />;
});
