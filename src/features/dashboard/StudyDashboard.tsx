"use client";

import { useEffect } from "react";
import { ContinueStudying } from "./continue-studying";
import { topics } from "./data";
import { ImportMaterial } from "./import-material";
import { RecentTopics } from "./recent-topics";
import { useStudyEngine } from "@/features/study/hooks/useStudyEngine";

export function StudyDashboard() {
  const { records, isReady, ensureTopics } = useStudyEngine();

  useEffect(() => {
    if (isReady) ensureTopics(topics);
  }, [ensureTopics, isReady]);

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[1fr_0.43fr]">
        <ContinueStudying records={records} />
        <ImportMaterial />
      </div>
      <RecentTopics records={records} />
    </>
  );
}
