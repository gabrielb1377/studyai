import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { PageHeading } from "@/components/page-heading";
import { topics } from "@/features/dashboard/data";

export const metadata: Metadata = { title: "Estudo" };

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ tema?: string }>;
}) {
  const { tema } = await searchParams;
  const topic = topics.find((item) => item.id === tema);
  return (
    <>
      <PageHeading
        eyebrow={topic ? `Estudo / ${topic.subject}` : "Estudo"}
        title={topic?.title ?? "Um espaço para se concentrar."}
        description={
          topic
            ? "Tema demonstrativo · Prévia do seu futuro ambiente de estudo."
            : "Menos distrações. Mais espaço para as suas descobertas."
        }
      />
      <EmptyState
        icon={BookOpen}
        title="Seu ambiente de estudo está ganhando forma"
        description="Em breve, você poderá explorar seus temas e estudar com seus materiais aqui. Nesta primeira etapa, estamos preparando seu espaço."
      >
        <Button asChild variant="outline">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Voltar ao Dashboard
          </Link>
        </Button>
      </EmptyState>
    </>
  );
}
