import type { Metadata } from "next";
import { PageHeading } from "@/components/page-heading";
import { OrganizationWorkspace } from "@/features/organization/OrganizationWorkspace";

export const metadata: Metadata = { title: "Organizar" };

export default function OrganizationPage() {
  return (
    <>
      <PageHeading
        eyebrow="Biblioteca"
        title="Organizar"
        description="Revise a estrutura dos materiais antes de adicioná-los à sua biblioteca. Todos os dados desta etapa são mockados."
      />
      <OrganizationWorkspace />
    </>
  );
}
