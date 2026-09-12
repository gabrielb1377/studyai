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

export function StudyDashboard() {
  const { records } = useStudyEngine();
  const { cards } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { notes } = useNotes();

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.43fr]">
        <ContinueStudying records={records} />
        <ImportMaterial />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <ExtractionSummary />
        <EmbeddingSummary />
      </div>
      <RecentTopics records={records} flashcards={cards} quizzes={quizzes} notes={notes} />
    </>
  );
}
