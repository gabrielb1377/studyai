import type { Metadata } from "next";
import { ProvasClient } from "./ProvasClient";

export const metadata: Metadata = { title: "Modo Semana de Prova" };

export default async function ProvasPage({ searchParams }: { searchParams: Promise<{ prova?: string }> }) {
  const { prova } = await searchParams;
  return <ProvasClient requestedExamId={prova} />;
}
