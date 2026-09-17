import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { StorageDiagnostics } from "@/features/storage/StorageDiagnostics";

export const metadata: Metadata = { title: "Storage" };

export default function StoragePage() {
  return (
    <>
      <PageHeading
        eyebrow="Ferramenta interna"
        title="Storage"
        description="Diagnóstico do banco local, migração e volume persistido pelo StudyAI."
      />
      <StorageDiagnostics />
    </>
  );
}
