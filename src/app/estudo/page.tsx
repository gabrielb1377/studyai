import type { Metadata } from "next";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string }>;
}) {
  const { tema } = await searchParams;
  return <StudyWorkspace requestedStudyId={tema} />;
}
