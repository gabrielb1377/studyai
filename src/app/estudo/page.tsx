import type { Metadata } from "next";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; arquivo?: string; aba?: string; layout?: string; novo?: string; modo?: string }>;
}) {
  const { tema, arquivo, aba, layout, novo, modo } = await searchParams;
  return <StudyWorkspace requestedStudyId={tema} requestedMaterialId={arquivo} requestedTab={aba} requestedLayoutId={layout} requestedQuizMode={modo === "exam" ? "exam" : undefined} resetWorkspace={novo === "1"} />;
}
