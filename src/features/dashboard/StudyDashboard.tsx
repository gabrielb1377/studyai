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
import { Skeleton } from "@/components/ui/skeleton";
import { SmartLearningDashboard } from "@/features/learning/components/SmartLearningDashboard";
import { useExperiencePreferences } from "@/features/preferences/ExperiencePreferences";
import { WorkspaceLauncher } from "./WorkspaceLauncher";
import { RecentActivityPanel } from "./RecentActivityPanel";
import { StudyProgressPanel } from "./StudyProgressPanel";
import { WeeklyGoalPanel } from "@/features/planning/components/WeeklyGoalPanel";

const DiagnosticsDrawer = dynamic(() => import("./DiagnosticsDrawer").then((module) => module.DiagnosticsDrawer));
const KnowledgeDashboard = dynamic(() => import("@/features/semantic/KnowledgeDashboard").then((module) => module.KnowledgeDashboard), { loading: () => <Skeleton className="h-40 rounded-2xl" /> });
const AcademyLabOverview = dynamic(() => import("./AcademyLabOverview").then((module) => module.AcademyLabOverview), { loading: () => <Skeleton className="h-44 rounded-2xl" /> });

export function StudyDashboard() {
  const { records, isLoading: studiesLoading, error: studiesError } = useStudyEngine();
  const { cards } = useFlashcards();
  const { results: quizzes } = useQuiz();
  const { notes } = useNotes();
  const { materials, isLoading: materialsLoading, error: materialsError } = useMaterials();
  const { records: contents } = useExtraction();
  const experience = useExperiencePreferences();

  return (
    <div className="space-y-7">
      <div className={records.length ? "grid gap-5 xl:grid-cols-[1fr_0.43fr]" : ""}>
        <ContinueStudying records={records} materials={materials} />
        {records.length > 0 && <ImportMaterial />}
      </div>
      <StudyProgressPanel studies={records} materials={materials} contents={contents}
        loading={studiesLoading || materialsLoading} incomplete={Boolean(studiesError || materialsError)} />
      <WeeklyGoalPanel compact showPlanningLink />
      <WorkspaceLauncher studies={records} />
      <AcademyLabOverview />
      <DashboardStats materials={materials} studies={records} flashcards={cards} quizzes={quizzes} contents={contents} advanced={experience.mode === "advanced"} />
      <SmartLearningDashboard studies={records} flashcards={cards} quizzes={quizzes} />
      <RecentActivityPanel materials={materials} studies={records} />
      {experience.mode === "advanced" && <KnowledgeDashboard studies={records} />}
      {experience.mode === "advanced" && <div className="flex justify-end"><DiagnosticsDrawer /></div>}
      <RecentTopics records={records} flashcards={cards} quizzes={quizzes} notes={notes} />
    </div>
  );
}
