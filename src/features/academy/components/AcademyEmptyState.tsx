import { GraduationCap } from "lucide-react";
import { Card } from "@/components/ui/card";

export function AcademyEmptyState() {
  return (
    <Card className="items-center border-dashed px-6 py-14 text-center sm:py-20">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><GraduationCap className="size-7" aria-hidden="true" /></span>
      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-semibold">Seu primeiro estudo livre começa aqui</h2>
        <p className="text-sm leading-6 text-muted-foreground">Escolha um tema, a matéria e como deseja estudar. Não é necessário importar nenhum arquivo.</p>
      </div>
    </Card>
  );
}
