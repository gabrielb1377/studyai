import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { TutorWorkspace } from "@/features/tutor/TutorWorkspace";

export const metadata: Metadata = { title: "Tutor IA" };

export default function TutorPage() {
  return (
    <>
      <PageHeading eyebrow="Estudo" title="Tutor IA" description="Converse com o Gemini mantendo o contexto do histórico salvo neste navegador." />
      <TutorWorkspace />
    </>
  );
}
