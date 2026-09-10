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
        description="Selecione materiais para extrair texto e metadados localmente. Nenhum arquivo é enviado para um servidor."
      />
      <ImportWorkspace />
    </>
  );
}
