import type { Metadata } from "next";
import { topics } from "@/features/dashboard/data";
import { StudyHeader } from "@/features/study/StudyHeader";
import { StudyWorkspace } from "@/features/study/StudyWorkspace";
import type { Topic } from "@/types/study";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string }>;
}) {
  const { tema } = await searchParams;
  const topic: Topic =
    topics.find((item) => item.id === tema) ?? {
      id: "vetores",
      title: "Vetores e matrizes",
      subject: "Algoritmos",
      description: "Entenda estruturas lineares para organizar e acessar dados.",
      progress: 35,
      lastStudied: "2026-09-08T10:00:00Z",
    };

  return (
    <>
      <StudyHeader topic={topic} />
      <StudyWorkspace topic={topic} />
    </>
  );
}
