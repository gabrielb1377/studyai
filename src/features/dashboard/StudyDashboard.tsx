"use client";

import { ContinueStudying } from "./continue-studying";
import { ImportMaterial } from "./import-material";
import { RecentTopics } from "./recent-topics";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";
import { useFlashcards } from "@/features/flashcards/useFlashcards";
import { useQuiz } from "@/features/quiz/useQuiz";
import { useNotes } from "@/features/notes/useNotes";
import { ExtractionSummary } from "@/features/extraction/ExtractionSummary";
import { EmbeddingSummary } from "@/features/retrieval/EmbeddingSummary";
import { useMaterials } from "@/hooks/useMaterials";
import { DashboardStats } from "./dashboard-stats";
import { AIStatusCard } from "./ai-status-card";

export function StudyDashboard() {
  const { records } = useStudyEngine();
  const { cards } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { notes } = useNotes();
  const { materials } = useMaterials();

  return (
    <>
      <DashboardStats materials={materials} studies={records} flashcards={cards} quizzes={quizzes} />
      <div className="grid gap-5 xl:grid-cols-[1fr_0.43fr]">
        <ContinueStudying records={records} />
        <ImportMaterial />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <ExtractionSummary />
        <EmbeddingSummary />
        <AIStatusCard />
      </div>
      <RecentTopics records={records} flashcards={cards} quizzes={quizzes} notes={notes} />
    </>
  );
}
