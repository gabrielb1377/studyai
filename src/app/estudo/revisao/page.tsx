import { PageHeading } from "@/components/page-heading";
import { TopicReviewWorkspace } from "@/features/learning/TopicReviewWorkspace";

export default function ReviewPage() {
  return <>
    <PageHeading eyebrow="Estudo" title="Revisão por disciplina" description="Pratique os temas estudados e acompanhe quando revisá-los." />
    <TopicReviewWorkspace />
  </>;
}
