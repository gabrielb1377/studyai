import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImportMaterialButton({
  label = "Importar Material",
}: {
  label?: string;
}) {
  return (
    <Button asChild className="h-11">
      <Link href="/importar">
        <Plus className="size-4" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
