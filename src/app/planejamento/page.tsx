import type { Metadata } from "next";
import { PlanejamentoClient } from "./PlanejamentoClient";

export const metadata: Metadata = {
  title: "Planejamento Inteligente",
};

export default async function PlanejamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ prova?: string }>;
}) {
  const { prova } = await searchParams;
  return <PlanejamentoClient requestedExamId={prova} />;
}
