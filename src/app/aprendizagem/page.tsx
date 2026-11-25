import type { Metadata } from "next";
import type { LearningWorkspaceTab } from "@/features/learning/errors/PersonalizedLearningWorkspace";
import { AprendizagemClient } from "./AprendizagemClient";

export const metadata: Metadata = {
  title: "Aprendizagem Personalizada",
};

function resolveTab(value: string | undefined): LearningWorkspaceTab | undefined {
  if (value === "mapa" || value === "erros" || value === "revisoes" || value === "memoria") {
    return value;
  }
  return undefined;
}

export default async function AprendizagemPage({
  searchParams,
}: {
  searchParams: Promise<{ estudo?: string; aba?: string }>;
}) {
  const { estudo, aba } = await searchParams;
  return (
    <AprendizagemClient
      initialStudyId={estudo}
      initialTab={resolveTab(aba)}
    />
  );
}
