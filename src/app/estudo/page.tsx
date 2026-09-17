import type { Metadata } from "next";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; arquivo?: string; aba?: string }>;
}) {
  const { tema, arquivo, aba } = await searchParams;
  return <StudyWorkspace requestedStudyId={tema} requestedMaterialId={arquivo} requestedTab={aba} />;
}
