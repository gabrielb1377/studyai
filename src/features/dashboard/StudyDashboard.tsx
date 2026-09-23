"use client";

import dynamic from "next/dynamic";

import { ContinueStudying } from "./continue-studying";
import { ImportMaterial } from "./import-material";
import { RecentTopics } from "./recent-topics";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useNotes } from "@/features/notes/useNotes";
import { useMaterials } from "@/hooks/useMaterials";
import { DashboardStats } from "./dashboard-stats";
import { useExtraction } from "@/features/extraction/useExtraction";
import { SmartLearningDashboard } from "@/features/learning/components/SmartLearningDashboard";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";

const DiagnosticsDrawer = dynamic(() => import("./DiagnosticsDrawer").then((module) => module.DiagnosticsDrawer));
const KnowledgeDashboard = dynamic(() => import("@/features/semantic/KnowledgeDashboard").then((module) => module.KnowledgeDashboard), { loading: () => <div className="h-40 animate-pulse rounded-2xl border bg-muted/30" /> });

export function StudyDashboard() {
  const { records } = useStudyEngine();
  const { cards } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { notes } = useNotes();
  const { materials } = useMaterials();
  const { records: contents } = useExtraction();
  const experience = useExperiencePreferences();

  return (
    <>
      <DashboardStats materials={materials} studies={records} flashcards={cards} quizzes={quizzes} contents={contents} />
      <SmartLearningDashboard studies={records} flashcards={cards} quizzes={quizzes} />
      {experience.mode === "advanced" && <KnowledgeDashboard studies={records} />}
      <div className="grid gap-5 xl:grid-cols-[1fr_0.43fr]">
        <ContinueStudying records={records} materials={materials} />
        <ImportMaterial />
      </div>
      {experience.mode === "advanced" && <div className="flex justify-end"><DiagnosticsDrawer /></div>}
      <RecentTopics records={records} flashcards={cards} quizzes={quizzes} notes={notes} />
    </>
  );
}
