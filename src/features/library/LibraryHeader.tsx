import { PageHeading } from "@/components/page-heading";
import { ImportMaterialButton } from "./ImportMaterialButton";

export function LibraryHeader() {
  return (
    <PageHeading
      eyebrow="Seu espaço de estudos"
      title="Biblioteca"
      description="Todos os seus materiais organizados."
      action={<ImportMaterialButton />}
    />
  );
}
