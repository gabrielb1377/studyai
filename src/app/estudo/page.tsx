import type { Metadata } from "next";
import Link from "next/link";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";
import { examReturnHref } from "@/features/exam/ExamLearningNavigation";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string; arquivo?: string; aba?: string; layout?: string; novo?: string; modo?: string; origem?: string; prova?: string }>;
}) {
  const { tema, arquivo, aba, layout, novo, modo, origem, prova } = await searchParams;
  const returnHref = origem === "provas" && prova ? examReturnHref(prova) : origem === "biblioteca" ? "/biblioteca" : undefined;
  return <>
    <Link className="mb-4 inline-block rounded-lg border px-3 py-2 text-sm font-medium" href="/estudo/revisao">Revisão por disciplina</Link>
    <StudyWorkspace requestedStudyId={tema} requestedMaterialId={arquivo} requestedTab={aba} requestedLayoutId={layout} requestedQuizMode={modo === "exam" ? "exam" : undefined} resetWorkspace={novo === "1"} returnHref={returnHref} />
  </>;
}
