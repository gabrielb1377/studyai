"use client";

import { useEffect } from "react";
import { BookOpen, Bot, GraduationCap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { initialStudyMessages, studyMaterials, studyTools } from "@/lib/mock/study-workspace";
import { AiTab } from "./AiTab";
import { MaterialTab } from "./MaterialTab";
import { StudyToolsTab } from "./StudyToolsTab";
import { StudyStatistics } from "./StudyStatistics";
import { useStudyEngine } from "./hooks/useStudyEngine";
import type { Topic } from "@/types/study";

export function StudyWorkspace({ topic }: { topic: Topic }) {
  const { records, isReady, recordAccess, setProgress, setStatus } = useStudyEngine();
  const record = records.find((item) => item.studyId === topic.id);

  useEffect(() => {
    if (isReady) recordAccess(topic);
  }, [isReady, recordAccess, topic]);

  return (
    <Tabs defaultValue="material" className="gap-6">
      <TabsList aria-label="Áreas de estudo" className="w-full justify-start overflow-x-auto sm:w-fit">
        <TabsTrigger value="material" className="min-w-28"><BookOpen aria-hidden="true" />Material</TabsTrigger>
        <TabsTrigger value="ia" className="min-w-24"><Bot aria-hidden="true" />IA</TabsTrigger>
        <TabsTrigger value="study" className="min-w-28"><GraduationCap aria-hidden="true" />Estudar</TabsTrigger>
      </TabsList>
      <TabsContent value="material" forceMount className="data-[state=inactive]:hidden"><MaterialTab materials={studyMaterials} /></TabsContent>
      <TabsContent value="ia" forceMount className="data-[state=inactive]:hidden"><AiTab messages={initialStudyMessages} /></TabsContent>
      <TabsContent value="study" forceMount className="data-[state=inactive]:hidden"><StudyToolsTab tools={studyTools} /></TabsContent>
      {record && <StudyStatistics record={record} onProgressChange={(progress) => setProgress(record.studyId, progress)} onStatusChange={(status) => setStatus(record.studyId, status)} />}
    </Tabs>
  );
}
