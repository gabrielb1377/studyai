import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { ImportWorkspace } from "@/features/import/ImportWorkspace";

export const metadata: Metadata = { title: "Importar" };

export default function ImportPage() {
  return (
    <>
      <PageHeading
        eyebrow="Biblioteca"
        title="Importar"
        description="Selecione materiais para preparar sua biblioteca. Nesta etapa, todo o processamento é apenas uma simulação local."
      />
      <ImportWorkspace />
    </>
  );
}
