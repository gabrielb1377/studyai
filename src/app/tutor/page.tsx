import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { TutorWorkspace } from "@/features/tutor/TutorWorkspace";

export const metadata: Metadata = { title: "Tutor IA" };

export default function TutorPage() {
  return (
    <>
      <PageHeading eyebrow="Estudo" title="Tutor IA" description="Um espaço de conversa preparado para acompanhar seus estudos. Nesta etapa, todas as respostas são apenas demonstrativas." />
      <TutorWorkspace />
    </>
  );
}
