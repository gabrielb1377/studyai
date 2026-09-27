import type { Metadata } from "next";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; arquivo?: string; aba?: string; layout?: string; novo?: string }>;
}) {
  const { tema, arquivo, aba, layout, novo } = await searchParams;
  return <StudyWorkspace requestedStudyId={tema} requestedMaterialId={arquivo} requestedTab={aba} requestedLayoutId={layout} resetWorkspace={novo === "1"} />;
}
