import { PageHeading } from "@/components/page-heading";
import { TopicReviewWorkspace } from "@/features/learning/TopicReviewWorkspace";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina } = await searchParams;
  return <>
    <PageHeading eyebrow="Estudo" title="Revisão por disciplina" description="Pratique os temas estudados e acompanhe quando revisá-los." />
    <TopicReviewWorkspace requestedDiscipline={typeof disciplina === "string" ? disciplina : undefined} />
  </>;
}
