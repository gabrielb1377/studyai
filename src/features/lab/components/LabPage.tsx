"use client";

import { useEffect, useState } from "react";
import { PageHeading } from "@/components/page-heading";
import { LabWorkspace } from "./LabWorkspace";

export function LabPage() {
  const [route, setRoute] = useState<{ studyId?: string; contentId?: string; exerciseId?: string }>({});
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setRoute({ studyId: params.get("academyStudyId") ?? undefined, contentId: params.get("contentId") ?? undefined, exerciseId: params.get("exercise") ?? undefined });
  }, []);
  return <>
    <PageHeading eyebrow="Prática segura" title="Laboratório" description="Escreva, execute, visualize e receba correções sem sair do StudyAI." />
    <LabWorkspace academyStudyId={route.studyId} academyContentId={route.contentId} requestedProjectId={route.exerciseId} />
  </>;
}
