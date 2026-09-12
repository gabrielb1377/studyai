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
        description="Organize os materiais importados por curso, semestre, matéria e tema."
      />
      <OrganizationWorkspace />
    </>
  );
}
